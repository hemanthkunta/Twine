#!/usr/bin/env bash
# ====================================================================
# Turnkey Coturn Installation & Provisioning Script
# Supported OS: Ubuntu 22.04 / 24.04 LTS, Debian 12
# ====================================================================

set -euo pipefail

if [ "$EUID" -ne 0 ]; then
  echo "❌ Error: Please run this script as root (e.g. sudo bash setup_coturn.sh)"
  exit 1
fi

DOMAIN="${1:-}"
SECRET="${2:-}"

if [ -z "$DOMAIN" ] || [ -z "$SECRET" ]; then
  echo "Usage: sudo bash setup_coturn.sh <YOUR_TURN_DOMAIN> <YOUR_TURN_SHARED_SECRET>"
  echo "Example: sudo bash setup_coturn.sh turn.twine.im c7f1e982a0b34d98a5e3d7c2b1f8e4a9"
  exit 1
fi

echo "======================================================"
echo "🚀 Installing and Configuring Coturn on $DOMAIN"
echo "======================================================"

# 1. Update packages & install coturn + certbot
apt update
apt install -y coturn certbot ufw

# 2. Configure Firewall
echo "🛡️ Configuring Firewall rules (UFW)..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3478/tcp
ufw allow 3478/udp
ufw allow 5349/tcp
ufw allow 5349/udp
ufw allow 49152:65535/udp
ufw --force enable

# 3. Obtain TLS Certificate (Standalone)
echo "🔒 Requesting Let's Encrypt TLS Certificate for $DOMAIN..."
certbot certonly --standalone --non-interactive --agree-tos --register-unsafely-without-email -d "$DOMAIN" || {
  echo "⚠️ Warning: Certbot standalone failed. Ensure DNS A record for $DOMAIN points to this server's public IP."
}

# 4. Enable Coturn systemd daemon
sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn || true
echo "TURNSERVER_ENABLED=1" > /etc/default/coturn

# 5. Write turnserver.conf
cat <<EOF > /etc/turnserver.conf
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=$SECRET
realm=$DOMAIN
cert=/etc/letsencrypt/live/$DOMAIN/fullchain.pem
pkey=/etc/letsencrypt/live/$DOMAIN/privkey.pem
min-port=49152
max-port=65535
log-file=/var/log/turnserver.log
verbose
no-cli
no-loopback-peers
no-multicast-peers
EOF

# Ensure coturn has permissions to read certs
chown -R turnserver:turnserver /etc/turnserver.conf || true

# 6. Restart Coturn Service
systemctl restart coturn
systemctl enable coturn

echo "======================================================"
echo "✅ Coturn is installed and running!"
echo "Status check:"
systemctl status coturn --no-pager
echo "------------------------------------------------------"
echo "Listening ports:"
netstat -tulnp | grep turnserver || ss -tulnp | grep turnserver
echo "======================================================"
echo "Next step: Set the following environment variables on Twine backend:"
echo "TURN_SHARED_SECRET=$SECRET"
echo "TURN_URLS=turn:$DOMAIN:3478,turns:$DOMAIN:5349"
echo "======================================================"
