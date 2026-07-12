# Shared location blocks — included by BOTH the HTTP and HTTPS servers in pia.conf.
# Upstreams are container names resolved at request time via the `resolver` above,
# so a restarted/renumbered backend is picked up without reloading nginx.

# Backend API — Spring Boot serves /api/v1/... ; keep the /api/ prefix intact.
location /api/ {
    set $pia_backend http://pia-backend:8080;
    proxy_pass         $pia_backend;
    proxy_http_version 1.1;
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
    client_max_body_size 500M;
}

# MinIO presigned-URL proxy — strip the /minio/ prefix before forwarding.
# Host MUST be forced to the same value the backend used to SIGN the presigned URL
# (its MINIO_ENDPOINT, "pia-minio:9000") — NOT passed through from the client
# ($host). Presigned S3 signatures include Host; forwarding the client's own Host
# (a public IP/domain) instead breaks the signature and MinIO returns 403
# SignatureDoesNotMatch on every upload/download. See docker-compose.production.yml.
location /minio/ {
    set $pia_minio http://pia-minio:9000;
    rewrite ^/minio/(.*)$ /$1 break;
    proxy_pass         $pia_minio;
    proxy_http_version 1.1;
    proxy_set_header   Host pia-minio:9000;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_buffering    off;
    client_max_body_size 500M;
}

# Grafana (optional monitoring) — served from the /grafana/ sub-path.
location /grafana/ {
    set $pia_grafana http://pia-grafana:3000;
    proxy_pass         $pia_grafana;
    proxy_http_version 1.1;
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection "upgrade";
}

# SPA — static files (shipped as release files, served by this base nginx).
# Client-side routing falls back to index.html.
location / {
    root      /usr/share/nginx/html;
    try_files $uri $uri/ /index.html;
}
