# Deploying w3mmd on the EC2 cohost

w3mmd runs as a long-lived Deno process on the shared EC2 box (beside blocktol,
emoji-sheep-tag, w3xio, …), behind nginx + certbot. It is stateless: no
database, no secrets, no build step.

- **Serving:** `w3mmd.service` (systemd) runs `deno task start` on
  `127.0.0.1:3050`; nginx (`w3mmd.nginx.conf`) terminates TLS and
  reverse-proxies to it without buffering, so results stream as they parse.
- **Deploy:** manual, see [Operating](#operating).

`deploy/w3mmd.service` and `deploy/w3mmd.nginx.conf` are **reference
templates**; the live copies are `/etc/systemd/system/w3mmd.service` and
`/etc/nginx/sites-enabled/w3mmd.conf`. Keep them in sync.

## Box facts

- Service account `ubuntu`, checkout `/home/ubuntu/w3mmd`, deno at
  `/home/ubuntu/.deno/bin/deno`.
- **Port 3050.** Taken on this box: 3017 (st2mr), 3020 (w3xio/dapi), 3030
  (emoji-sheep-tag), 3040 (blocktol), 3626 (w3x.io + `/sql`), 3627 (katma).
  Confirm it is still free first: `sudo ss -ltnp | grep 3050` prints nothing.

## One-time setup

1. **Clone** as `ubuntu`, and fetch the npm dependency into deno's cache:
   ```bash
   git clone https://github.com/voces/w3mmd /home/ubuntu/w3mmd
   cd /home/ubuntu/w3mmd && deno install
   ```
2. **systemd:**
   ```bash
   sudo cp deploy/w3mmd.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now w3mmd
   curl -s localhost:3050/ | head -3        # the upload form
   ```
3. **nginx:** copy `deploy/w3mmd.nginx.conf` to
   `/etc/nginx/sites-enabled/w3mmd.conf`, set `server_name`, then
   `sudo nginx -t && sudo systemctl reload nginx`. Once certbot has edited the
   live vhost, merge later changes into it by hand rather than copying over it.
4. **DNS + TLS:** point the domain's A record at the box (it is IPv4-only, so no
   AAAA), then `sudo certbot --nginx -d <domain>`.

   If the domain is **already live on Deno Deploy** (a custom domain, not
   `*.deno.dev`), do it in the zero-downtime order instead: pre-issue the cert
   with DNS-01 before repointing, lower the TTL, repoint A, delete any AAAA,
   then reissue with `--nginx`. blocktol's `deploy/README.md` (steps 6 and
   Cutover) walks through exactly that, including the `_acme-challenge` CNAME
   Deno leaves behind.

## Cutover

1. Check the new host end to end: the upload form loads, a replay id renders
   (`https://<domain>/<id>`), and `/<id>/json` returns JSON.
2. Update anything that links to the old URL (map docs, wc3stats, Discord pins).
   A `*.deno.dev` address can't be redirected once Deno Deploy shuts down, so
   move links before then.
3. Delete the project on Deno Deploy (or disconnect its GitHub integration) so a
   push doesn't deploy in two places.

## Operating

- Logs: `journalctl -u w3mmd -f`
- Deploy: `git -C /home/ubuntu/w3mmd pull && sudo systemctl restart w3mmd` (run
  `deno install` first if `deno.lock` changed)
- Rollback: `git -C /home/ubuntu/w3mmd checkout <sha>` then restart.
