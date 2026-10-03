FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
# BACKEND_URL is substituted into the nginx template at container start
ENV BACKEND_URL=http://ms-monitoring-qa-be:8080
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/monitoring-qa-alfagift/browser /usr/share/nginx/html
EXPOSE 80
