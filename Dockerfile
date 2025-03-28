FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install Python and build dependencies for native modules
RUN apk add --no-cache python3 make g++ gcc

# Install app dependencies
# Copy package files first for better caching
COPY package*.json ./
RUN npm ci --only=production

# Copy app source
COPY . .

# Create data directory for persistent storage
RUN mkdir -p data logs

# Expose port
EXPOSE 3000

# Define health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s \
  CMD node -e "require('http').get('http://localhost:3000/', (res) => res.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Start the app
CMD ["node", "index.js"]