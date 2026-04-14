```c
/*********************************************************************
 *  spreader-tool.c
 *
 *  A lightweight content‑distribution agent for edge devices
 *  (Raspberry Pi, NVIDIA Jetson).  Implements the CLI described in the
 *  specification and an optional minimal HTTP‑JSON API.
 *
 *  Build:   gcc -Wall -Wextra -O2 -o spreader spreader-tool.c
 *
 *  No external libraries are required – only POSIX and the C stdlib.
 *********************************************************************/

#define _POSIX_C_SOURCE 200809L
#define _GNU_SOURCE

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <signal.h>
#include <errno.h>
#include <time.h>
#include <stdarg.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/select.h>
#include <sys/un.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <pthread.h>

/* ----------------------------------------------------------------- *
 *  Constants & configuration
 * ----------------------------------------------------------------- */
#define DEFAULT_PORT          8901
#define DEFAULT_API_PORT      8080
#define LOG_FILE              "spreader.log"
#define CONFIG_FILE_USER      ".spreader/config.txt"
#define CONFIG_FILE_SYSTEM    "/etc/spreader/config.txt"
#define MAX_TARGETS           256
#define BUFFER_SIZE           8192
#define HTTP_MAX_HEADER       4096
#define HTTP_MAX_BODY         65536
#define OFFLINE_QUEUE_FILE    "spreader_queue.txt"

/* ----------------------------------------------------------------- *
 *  Types
 * ----------------------------------------------------------------- */
typedef struct {
    char host[256];
    int  port;
} Target;

typedef struct {
    Target targets[MAX_TARGETS];
    size_t count;
} TargetList;

/* ----------------------------------------------------------------- *
 *  Global state
 * ----------------------------------------------------------------- */
static volatile sig_atomic_t g_terminate = 0;
static FILE *g_log = NULL;
static TargetList g_target_list = { .count = 0 };
static char g_config_path[512] = "";
static char g_log_path[512]   = LOG_FILE;

/* ----------------------------------------------------------------- *
 *  Utility functions
 * ----------------------------------------------------------------- */
static void log_msg(const char *fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    if (!g_log) {
        g_log = fopen(g_log_path, "a");
        if (!g_log) g_log = stderr;
    }
    time_t now = time(NULL);
    char tbuf[32];
    strftime(tbuf, sizeof tbuf, "%Y-%m-%d %H:%M:%S", localtime(&now));
    fprintf(g_log, "[%s] ", tbuf);
    vfprintf(g_log, fmt, ap);
    fprintf(g_log, "\n");
    fflush(g_log);
    va_end(ap);
}

static void sig_handler(int sig)
{
    (void)sig;
    g_terminate = 1;
}

/* ----------------------------------------------------------------- *
 *  Configuration handling (simple line based: host port)
 * ----------------------------------------------------------------- */
static const char *default_config_path(void)
{
    const char *home = getenv("HOME");
    if (home) {
        static char path[512];
        snprintf(path, sizeof path, "%s/%s", home, CONFIG_FILE_USER);
        return path;
    }
    return CONFIG_FILE_SYSTEM;
}

static int load_config(const char *path)
{
    FILE *fp = fopen(path, "r");
    if (!fp) {
        log_msg("Config file %s not found, starting with empty target list", path);
        return -1;
    }
    char line[512];
    g_target_list.count = 0;
    while (fgets(line, sizeof line, fp) && g_target_list.count < MAX_TARGETS) {
        char host[256];
        int port;
        if (sscanf(line, "%255s %d", host, &port) == 2) {
            strncpy(g_target_list.targets[g_target_list.count].host, host, sizeof host);
            g_target_list.targets[g_target_list.count].port = port;
            g_target_list.count++;
        }
    }
    fclose(fp);
    log_msg("Loaded %zu target(s) from %s", g_target_list.count, path);
    return 0;
}

static int save_config(const char *path)
{
    FILE *fp = fopen(path, "w");
    if (!fp) {
        log_msg("Failed to write config %s: %s", path, strerror(errno));
        return -1;
    }
    for (size_t i = 0; i < g_target_list.count; ++i) {
        fprintf(fp, "%s %d\n",
                g_target_list.targets[i].host,
                g_target_list.targets[i].port);
    }
    fclose(fp);
    log_msg("Saved %zu target(s) to %s", g_target_list.count, path);
    return 0;
}

/* ----------------------------------------------------------------- *
 *  Target list management
 * ----------------------------------------------------------------- */
static int target_find(const char *host)
{
    for (size_t i = 0; i < g_target_list.count; ++i) {
        if (strcmp(g_target_list.targets[i].host, host) == 0)
            return (int)i;
    }
    return -1;
}

static void cmd_add_target(const char *host, int port)
{
    if (target_find(host) >= 0) {
        printf("Target %s already exists.\n", host);
        return;
    }
    if (g_target_list.count >= MAX_TARGETS) {
        printf("Maximum number of targets reached.\n");
        return;
    }
    strncpy(g_target_list.targets[g_target_list.count].host, host, sizeof g_target_list.targets[0].host);
    g_target_list.targets[g_target_list.count].port = port;
    g_target_list.count++;
    save_config(g_config_path);
    printf("Added target %s:%d\n", host, port);
}

static void cmd_remove_target(const char *host)
{
    int idx = target_find(host);
    if (idx < 0) {
        printf("Target %s not found.\n", host);
        return;
    }
    for (size_t i = idx; i + 1 < g_target_list.count; ++i)
        g_target_list.targets[i] = g_target_list.targets[i + 1];
    g_target_list.count--;
    save_config(g_config_path);
    printf("Removed target %s\n", host);
}

static void cmd_list_targets(void)
{
    if (g_target_list.count == 0) {
        printf("No known targets.\n");
        return;
    }
    printf("Known targets (%zu):\n", g_target_list.count);
    for (size_t i = 0; i < g_target_list.count; ++i)
        printf("  %s:%d\n", g_target_list.targets[i].host, g_target_list.targets[i].port);
}

/* ----------------------------------------------------------------- *
 *  Network helpers
 * ----------------------------------------------------------------- */
static int tcp_connect(const char *host, int port)
{
    struct addrinfo hints = {0}, *res, *rp;
    int sfd = -1;
    char sport[16];
    snprintf(sport, sizeof sport, "%d", port);

    hints.ai_family   = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;

    if (getaddrinfo(host, sport, &hints, &res) != 0)
        return -1;

    for (rp = res; rp != NULL; rp = rp->ai_next) {
        sfd = socket(rp->ai_family, rp->ai_socktype, rp->ai_protocol);
        if (sfd == -1) continue;
        if (connect(sfd, rp->ai_addr, rp->ai_addrlen) == 0) break;
        close(sfd);
        sfd = -1;
    }
    freeaddrinfo(res);
    return sfd;
}

/* ----------------------------------------------------------------- *
 *  File transfer (simple chunked send, no resume for brevity)
 * ----------------------------------------------------------------- */
static void send_file_to_target(const char *filepath, const Target *t)
{
    int fd = open(filepath, O_RDONLY);
    if (fd < 0) {
        log_msg("Failed to open %s: %s", filepath, strerror(errno));
        return;
    }

    int sock = tcp_connect(t->host, t->port);
    if (sock < 0) {
        log_msg("Cannot connect to %s:%d", t->host, t->port);
        close(fd);
        return;
    }

    /* Simple protocol:
     *   4 bytes: filename length (network order)
     *   N bytes: filename (no path)
     *   8 bytes: file size (network order)
     *   ...    : file data
     */
    const char *fname = strrchr(filepath, '/');
    fname = fname ? fname + 1 : filepath;
    uint32_t fnlen = htonl((uint32_t)strlen(fname));
    uint64_t fsize = (uint64_t)lseek(fd, 0, SEEK_END);
    lseek(fd, 0, SEEK_SET);
    uint64_t fsize_n = htobe64(fsize);

    if (write(sock, &fnlen, 4) != 4 ||
        write(sock, fname, strlen(fname)) != (ssize_t)strlen(fname) ||
        write(sock, &fsize_n, 8) != 8) {
        log_msg("Failed to send header to %s:%d", t->host, t->port);
        close(sock);
        close(fd);
        return;
    }

    char buf[BUFFER_SIZE];
    ssize_t r;
    while ((r = read(fd, buf, sizeof buf)) > 0) {
        ssize_t w = 0;
        while (w < r) {
            ssize_t n = write(sock, buf + w, r - w);
            if (n <= 0) {
                log_msg("Write error to %s:%d", t->host, t->port);
                close(sock);
                close(fd);
                return;
            }
            w += n;
        }
    }
    log_msg("Sent %s (%llu bytes) to %s:%d", fname, (unsigned long long)fsize, t->host, t->port);
    close(sock);
    close(fd);
}

/* ----------------------------------------------------------------- *
 *  CLI command: send
 * ----------------------------------------------------------------- */
static void cmd_send(const char *filepath, char **target_args, int ntargets)
{
    if (access(filepath, R_OK) != 0) {
        printf("Cannot read file %s\n", filepath);
        return;
    }

    for (int i = 0; i < ntargets; ++i) {
        const char *spec = target_args[i];
        char host[256];
        int port = DEFAULT_PORT;
        char *colon = strchr(spec, ':');
        if (colon) {
            size_t hlen = colon - spec;
            if (hlen >= sizeof host) hlen = sizeof host - 1;
            memcpy(host, spec, hlen);
            host[hlen] = '\0';
            port = atoi(colon + 1);
        } else {
            strncpy(host, spec, sizeof host);
            host[sizeof host - 1] = '\0';
        }

        Target t = {.port = port};
        strncpy(t.host, host, sizeof t.host);
        send_file_to_target(filepath, &t);
    }
}

/* ----------------------------------------------------------------- *
 *  Broadcast (UDP) – send a short message to each known target
 * ----------------------------------------------------------------- */
static void cmd_broadcast(const char *msg)
{
    for (size_t i = 0; i < g_target_list.count; ++i) {
        int sock = socket(AF_INET, SOCK_DGRAM, 0);
        if (sock < 0) {
            log_msg("UDP socket error: %s", strerror(errno));
            continue;
        }
        struct sockaddr_in addr = {0};
        addr.sin_family = AF_INET;
        addr.sin_port   = htons(g_target_list.targets[i].port);
        if (inet_pton(AF_INET, g_target_list.targets[i].host, &addr.sin_addr) <= 0) {
            log_msg("Invalid IPv4 address %s", g_target_list.targets[i].host);
            close(sock);
            continue;
        }
        sendto(sock, msg, strlen(msg), 0,
               (struct sockaddr *)&addr, sizeof addr);
        close(sock);
        log_msg("Broadcast to %s:%d", g_target_list.targets[i].host,
                g_target_list.targets[i].port);
    }
}

/* ----------------------------------------------------------------- *
 *  Receive mode – simple TCP server that stores incoming files
 * ----------------------------------------------------------------- */
static void *receive_thread(void *arg)
{
    int port = *(int *)arg;
    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (listen_fd < 0) {
        log_msg("listen socket: %s", strerror(errno));
        return NULL;
    }

    int opt = 1;
    setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof opt);

    struct sockaddr_in srv = {0};
    srv.sin_family = AF_INET;
    srv.sin_addr.s_addr = INADDR_ANY;
    srv.sin_port = htons(port);
    if (bind(listen_fd, (struct sockaddr *)&srv, sizeof srv) < 0) {
        log_msg("bind: %s", strerror(errno));
        close(listen_fd);
        return NULL;
    }
    if (listen(listen_fd, 8) < 0) {
        log_msg("listen: %s", strerror(errno));
        close(listen_fd);
        return NULL;
    }
    log_msg("Receiver listening on port %d", port);
    while (!g_terminate) {
        struct sockaddr_in cli;
        socklen_t clilen = sizeof cli;
        int conn = accept(listen_fd, (struct sockaddr *)&cli, &clilen);
        if (conn < 0) {
            if (errno == EINTR) continue;
            log_msg("accept: %s", strerror(errno));
            continue;
        }

        /* Receive header */
        uint32_t fnlen_n;
        if (read(conn, &fnlen_n, 4) != 4) { close(conn); continue; }
        uint32_t fnlen = ntohl(fnlen_n);
        if (fnlen == 0 || fnlen > 255) { close(conn); continue; }

        char filename[256];
        if (read(conn, filename, fnlen) != (ssize_t)fnlen) { close(conn); continue; }
        filename[fnlen] = '\0';

        uint64_t fsize_n;
        if (read(conn, &fsize_n, 8) != 8) { close(conn); continue; }
        uint64_t fsize = be64toh(fsize_n);

        /* Write to file (in current directory) */
        int out = open(filename, O_WRONLY | O_CREAT | O_TRUNC, 0644);
        if (out < 0) {
            log_msg("cannot create %s: %s", filename, strerror(errno));
            close(conn);
            continue;
        }

        uint64_t received = 0;
        char buf[BUFFER_SIZE];
        while (received < fsize) {
            ssize_t toread = (fsize - received > BUFFER_SIZE) ? BUFFER_SIZE : (ssize_t)(fsize - received);
            ssize_t r = read(conn, buf, toread);
            if (r <= 0) break;
            write(out, buf, r);
            received += r;
        }
        close(out);
        close(conn);
        log_msg("Received %s (%llu bytes)", filename, (unsigned long long)fsize);
    }
    close(listen_fd);
    return NULL;
}

/* ----------------------------------------------------------------- *
 *  Simple HTTP server (only when --api is used)
 * ----------------------------------------------------------------- */
static void *http_thread(void *arg)
{
    int port = *(int *)arg;
    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (listen_fd < 0) {
        log_msg("HTTP socket: %s", strerror(errno));
        return NULL;
    }
    int opt = 1;
    setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof opt);
    struct sockaddr_in srv = {0};
    srv.sin_family = AF_INET;
    srv.sin_addr.s_addr = INADDR_ANY;
    srv.sin_port = htons(port);
    if (bind(listen_fd, (struct sockaddr *)&srv, sizeof srv) < 0) {
        log_msg("HTTP bind: %s", strerror(errno));
        close(listen_fd);
        return NULL;
    }
    if (listen(listen_fd, 8) < 0) {
        log_msg("HTTP listen: %s", strerror(errno));
        close(listen_fd);
        return NULL;
    }
    log_msg("HTTP API listening on port %d", port);

    while (!g_terminate) {
        struct sockaddr_in cli;
        socklen_t clilen = sizeof cli;
        int conn = accept(listen_fd, (struct sockaddr *)&cli, &clilen);
        if (conn < 0) {
            if (errno == EINTR) continue;
            log_msg("HTTP accept: %s", strerror(errno));
            continue;
        }

        /* Read request line + headers (very naive) */
        char request[HTTP_MAX_HEADER];
        ssize_t r = recv(conn, request, sizeof request - 1, 0);
        if (r <= 0) { close(conn); continue; }
        request[r] = '\0';

        /* Parse method and path */
        char method[8], path[64];
        if (sscanf(request, "%7s %63s", method, path) != 2) {
            close(conn);
            continue;
        }

        /* Helper to send a JSON response */
        auto send_json = [&](int code, const char *json_body) {
            char header[256];
            int len = snprintf(header, sizeof header,
                               "HTTP/1.1 %d %s\r\n"
                               "Content-Type: application/json\r\n"
                               "Content-Length: %zu\r\n"
                               "Connection: close\r\n\r\n",
                               code, (code == 200) ? "OK" : "Error",
                               strlen(json_body));
            send(conn, header, len, 0);
            send(conn, json_body, strlen(json_body), 0);
        };

        if (strcmp(method, "GET") == 0 && strcmp(path, "/status") == 0) {
            char body[256];
            snprintf(body, sizeof body,
                     "{\"status\":\"running\",\"targets\":%zu}",
                     g_target_list.count);
            send_json(200, body);
        } else if (strcmp(method, "GET") == 0 && strcmp(path, "/targets") == 0) {
            char body[1024] = "{ \"targets\": [";
            for (size_t i = 0; i < g_target_list.count; ++i) {
                char entry[128];
                snprintf(entry, sizeof entry,
                         "{\"host\":\"%s\",\"port\":%d}%s",
                         g_target_list.targets[i].host,
                         g_target_list.targets[i].port,
                         (i + 1 == g_target_list.count) ? "" : ",");
                strncat(body, entry, sizeof body - strlen(body) - 1);
            }
            strcat(body, "] }");
            send_json(200, body);
        } else if (strcmp(method, "POST") == 0 && strcmp(path, "/target") == 0) {
            /* Very tiny JSON parser: look for "host":"...", "port":nn */
            char *p = strstr(request, "\r\n\r\n");
            if (!p) { close(conn); continue; }
            char *json = p + 4;
            char host[256] = "";
            int port = DEFAULT_PORT;
            char *h = strstr(json, "\"host\"");
            if (h) {
                sscanf(h, "\"host\"%*[: \"]%255[^\"]", host);
            }
            char *pt = strstr(json, "\"port\"");
            if (pt) {
                sscanf(pt, "\"port\"%*[: ]%d", &port);
            }
            if (host[0]) {
                cmd_add_target(host, port);
                send_json(200, "{\"result\":\"added\"}");
            } else {
                send_json(400, "{\"error\":\"invalid json\"}");
            }
        } else if (strcmp(method, "POST") == 0 && strcmp(path, "/send") == 0) {
            /* Expect JSON: {"file":"path","targets":["host:port",...]} */
            char *p = strstr(request, "\r\n\r\n");
            if (!p) { close(conn); continue; }
            char *json = p + 4;
            char file[256] = "";
            char targets[8][256];
            int nt = 0;

            char *f = strstr(json, "\"file\"");
            if (f) {
                sscanf(f, "\"file\"%*[: \"]%255[^\"]", file);
            }
            char *t = strstr(json, "\"targets\"");
            if (t) {
                char *br = strchr(t, '[');
                if (br) {
                    char *end = strchr(br, ']');
                    if (end) {
                        char list[512];
                        size_t len = end - br - 1;
                        if (len >= sizeof list) len = sizeof list - 1;
                        memcpy(list, br + 1, len);
                        list[len] = '\0';
                        char *tok = strtok(list, ",");
                        while (tok && nt < 8) {
                            while (*tok == ' ' || *tok == '\"') ++tok;
                            char *q = tok;
                            while (*q && *q != '\"') ++q;
                            *q = '\0';
                            strncpy(targets[nt], tok, sizeof targets[nt]);
                            nt++;
                            tok = strtok(NULL, ",");
                        }
                    }
                }
            }
            if (file[0] && nt > 0) {
                cmd_send(file, targets, nt);
                send_json(200, "{\"result\":\"sent\"}");
            } else {
                send_json(400, "{\"error\":\"invalid json\"}");
            }
        } else if (strcmp(method, "POST") == 0 && strcmp(path, "/broadcast") == 0) {
            char *p = strstr(request, "\r\n\r\n");
            if (!p) { close(conn); continue; }
            char *json = p + 4;
            char msg[256] = "";
            char *m = strstr(json, "\"message\"");
            if (m) {
                sscanf(m, "\"message\"%*[: \"]%255[^\"]", msg);
            }
            if (msg[0]) {
                cmd_broadcast(msg);
                send_json(200, "{\"result\":\"broadcasted\"}");
            } else {
                send_json(400, "{\"error\":\"invalid json\"}");
            }
        } else {
            send_json(404, "{\"error\":\"not found\"}");
        }
        close(conn);
    }
    close(listen_fd);
    return NULL;
}

/* ----------------------------------------------------------------- *
 *  Daemonisation helper
 * ----------------------------------------------------------------- */
static void daemonise(void)
{
    pid_t pid = fork();
    if (pid < 0) exit(EXIT_FAILURE);
    if (pid > 0) exit(EXIT_SUCCESS);   /* parent exits */
    if (setsid() < 0) exit(EXIT_FAILURE);
    signal(SIGCHLD, SIG_IGN);
    signal(SIGHUP, SIG_IGN);
    int fd = open("/dev/null", O_RDWR);
    if (fd != -1) {
        dup2(fd, STDIN_FILENO);
        dup2(fd, STDOUT_FILENO);
        dup2(fd, STDERR_FILENO);
        if (fd > 2) close(fd);
    }
}

/* ----------------------------------------------------------------- *
 *  Main
 * ----------------------------------------------------------------- */
int main(int argc, char *argv[])
{
    /* Basic signal handling */
    struct sigaction sa = {0};
    sa.sa_handler = sig_handler;
    sigaction(SIGINT,  &sa, NULL);
    sigaction(SIGTERM, &sa, NULL);

    /* Determine config file location */
    const char *cfg = getenv("SPREADER_CONFIG");
    if (!cfg) cfg = default_config_path();
    strncpy(g_config_path, cfg, sizeof g_config_path - 1);
    load_config(g_config_path);

    /* Parse global options */
    int api_mode = 0;
    int api_port = DEFAULT_API_PORT;
    int i = 1;
    while (i < argc && argv[i][0] == '-') {
        if (strcmp(argv[i], "--api") == 0) {
            api_mode = 1;
            if (i + 1 < argc && argv[i+1][0] != '-') {
                api_port = atoi(argv[++i]);
            }
        } else {
            fprintf(stderr, "Unknown global option %s\n", argv[i]);
            return EXIT_FAILURE;
        }
        ++i;
    }

    /* If API mode, start HTTP thread and exit after daemonising (if requested) */
    if (api_mode) {
        pthread_t http_tid;
        if (pthread_create(&http_tid, NULL, http_thread, &api_port) != 0) {
            perror("pthread_create");
            return EXIT_FAILURE;
        }
        /* If the user also asked for daemon, detach */
        if (i < argc && strcmp(argv[i], "daemon") == 0) {
            daemonise();
        }
        pthread_join(http_tid, NULL);
        return EXIT_SUCCESS;
    }

    /* Normal CLI handling */
    if (i >= argc) {
        fprintf(stderr,
                "Usage: %s [--api [port]] <command> [args]\n"
                "Commands:\n"
                "  send <file> <host[:port] ...>\n"
                "  broadcast <message>\n"
                "  receive [--port N]\n"
                "