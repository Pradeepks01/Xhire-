# Use an official Node.js runtime
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the Next.js port
EXPOSE 3000

# The command to run when the container starts
CMD ["npm", "run", "dev"]