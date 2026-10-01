# Deploying Sprasa HR

This guide assumes one Ubuntu 24.04 server with a public IP, a domain pointing at it (the examples use `hr.sprasatechnicalsolution.com.np`), and SSH access. The same layout works on any Linux host.

```text
Browser ──HTTPS──> Nginx ──> /            static files (frontend/dist)
                        └──> /api/v1/*    Node.js API on 127.0.0.1:5000 ──> PostgreSQL
```

## 1. Install packages

```bash
sudo apt update
sudo apt install -y nginx postgresql postgresql-client certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

## 2. Database

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE sprasa WITH LOGIN PASSWORD 'a-long-random-password';
CREATE DATABASE sprasa_hr OWNER sprasa;
SQL
```

Production needs `migrate deploy` only, so the role doesn't need `CREATEDB` there. Keep PostgreSQL listening on localhost (the Ubuntu default).

## 3. Application

```bash
sudo useradd --system --create-home --home-dir /opt/sprasa-hr sprasa
sudo -u sprasa git clone <repository url> /opt/sprasa-hr/app
cd /opt/sprasa-hr/app
sudo -u sprasa npm ci
sudo -u sprasa cp backend/.env.example backend/.env
sudo -u sprasa nano backend/.env
```

Production values:

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://sprasa:<password>@localhost:5432/sprasa_hr?schema=public
JWT_ACCESS_SECRET=<48 random bytes, hex>
JWT_REFRESH_SECRET=<a different 48 random bytes, hex>
FRONTEND_URL=https://hr.sprasatechnicalsolution.com.np
SMTP_HOST=<your provider>
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM="Sprasa HR <hr@your-domain>"
UPLOAD_DIR=/var/lib/sprasa-hr/uploads
BACKUP_DIR=/var/lib/sprasa-hr/backups
BACKUP_RETENTION_DAYS=14
ENABLE_JOBS=true
```

```bash
sudo mkdir -p /var/lib/sprasa-hr/uploads /var/lib/sprasa-hr/backups
sudo chown -R sprasa: /var/lib/sprasa-hr && sudo chmod 750 /var/lib/sprasa-hr
sudo -u sprasa npm run db:generate
sudo -u sprasa npm run build
sudo -u sprasa npm run db:deploy -w backend
```

Create your organisation and its first Super Admin (don't run the demo seed in production):

```bash
sudo -u sprasa env ORG_NAME="Your Company Pvt. Ltd." ADMIN_NAME="Your Name" \
  ADMIN_EMAIL=you@company.com.np ADMIN_PASSWORD='a long password' \
  npm run setup:admin -w backend
```

This adds default roles, leave types, salary components and sample tax slabs, all editable in the app.

## 4. Run the API with systemd

`/etc/systemd/system/sprasa-hr.service`:

```ini
[Unit]
Description=Sprasa HR API
After=network.target postgresql.service

[Service]
User=sprasa
WorkingDirectory=/opt/sprasa-hr/app/backend
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=/var/lib/sprasa-hr

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sprasa-hr
journalctl -u sprasa-hr -f        # JSON logs
```

## 5. Nginx and HTTPS

`/etc/nginx/sites-available/sprasa-hr`:

```nginx
server {
  server_name hr.sprasatechnicalsolution.com.np;
  root /opt/sprasa-hr/app/frontend/dist;
  index index.html;
  client_max_body_size 6m;
  server_tokens off;

  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options nosniff always;
  add_header X-Frame-Options DENY always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;

  location /api/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
  }

  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
  location / { try_files $uri $uri/ /index.html; }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/sprasa-hr /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d hr.sprasatechnicalsolution.com.np
```

The API trusts one proxy hop in production (`trust proxy = 1`), so client IPs in the audit log and rate limiter come from `X-Forwarded-For`. Don't put a second proxy in front without changing that.

## 6. Updating

```bash
cd /opt/sprasa-hr/app
sudo -u sprasa git pull
sudo -u sprasa npm ci
sudo -u sprasa npm run db:generate
sudo -u sprasa npm run build
sudo -u sprasa npm run db:deploy -w backend
sudo systemctl restart sprasa-hr
```

Take a backup before any update that includes a migration.

## Backups

The API runs `pg_dump` on `BACKUP_CRON` (Nepal time) into `BACKUP_DIR/backup-<timestamp>/`, copies the uploads folder next to it, and deletes runs older than `BACKUP_RETENTION_DAYS`. Settings → System & backups shows the history.

Copy the folder off the server every night. For example, with rclone to S3-compatible storage:

```bash
# /etc/cron.d/sprasa-offsite
30 3 * * * sprasa rclone sync /var/lib/sprasa-hr/backups remote:sprasa-hr-backups --max-age 15d
```

Restore:

```bash
sudo systemctl stop sprasa-hr
pg_restore --clean --if-exists -d "postgresql://sprasa:<password>@localhost/sprasa_hr" backup-<timestamp>/database.dump
rsync -a backup-<timestamp>/uploads/ /var/lib/sprasa-hr/uploads/
sudo systemctl start sprasa-hr
```

Practise a restore on a spare machine before you need one.

## Docker

`docker-compose.yml` runs PostgreSQL, the API and Nginx with the built frontend. Put a TLS-terminating proxy (Caddy, Traefik or host Nginx) in front of port 8080 in production. Volumes `pgdata`, `uploads` and `backups` hold all the state. Back up at least `pgdata` (or the dumps in `backups`) and `uploads`.

## Before go-live

- [ ] `backend/.env` has production values, and neither JWT secret is reused anywhere
- [ ] Production database created, `npm run db:deploy` applied
- [ ] HTTPS works, HTTP redirects to HTTPS
- [ ] `FRONTEND_URL` and CORS match the real domain
- [ ] SMTP connects (Settings → System & backups)
- [ ] `UPLOAD_DIR` is outside the web root and readable only by the service user
- [ ] Nightly backups run, off-site copy runs, a test restore has worked
- [ ] Demo users removed or their passwords changed; the first real super admin set up
- [ ] `NODE_ENV=production` (no stack traces in API errors)
- [ ] Logs are collected (journald or your log platform)
- [ ] Rate limiting active (it is on by default)
- [ ] Audit log shows logins and changes
- [ ] Payroll settings, salary components and PF/SSF rates checked by your accountant
- [ ] Tax slabs for the current fiscal year checked by your accountant or tax professional
- [ ] Holiday calendar entered from the official notice for the year
