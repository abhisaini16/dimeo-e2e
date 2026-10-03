FROM mcr.microsoft.com/playwright:v1.63.0-jammy
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY scripts ./scripts
COPY cloud ./cloud
COPY tests/data/sites.json ./tests/data/sites.json
ENV TZ=Australia/Sydney
ENTRYPOINT ["node", "cloud/run-job.js"]
