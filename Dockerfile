FROM nginx:alpine

COPY src/** /usr/share/nginx/html/
COPY media/** /usr/share/nginx/html/media

EXPOSE 80
