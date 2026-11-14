FROM nginxinc/nginx-unprivileged:1.31.7-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e
ENV MYCA_EARLY_ACCESS_URL=""
ENV NGINX_ENVSUBST_FILTER="^MYCA_"
COPY deploy/site/default.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/public /usr/share/nginx/html
EXPOSE 8080
