FROM nginxinc/nginx-unprivileged:1.31.7-alpine
COPY deploy/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/public /usr/share/nginx/html
EXPOSE 8080
