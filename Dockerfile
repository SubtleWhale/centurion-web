FROM nginx:alpine

COPY src/** /usr/share/nginx/html/
COPY media/** /usr/share/nginx/html/media/

RUN sed -i '/<!-- DEV_START -->/,/<!-- DEV_END -->/d' /usr/share/nginx/html/index.html \
 && sed -i '/\/\/ DEV_START/,/\/\/ DEV_END/d' /usr/share/nginx/html/app.js

EXPOSE 80
