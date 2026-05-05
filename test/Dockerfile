FROM node:22.21.1-bookworm-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		ca-certificates \
		curl \
		ffmpeg \
		g++ \
		git \
		make \
		postgresql-client \
		python3 \
		zip \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /geesome-node

RUN corepack enable && corepack prepare yarn@1.22.22 --activate
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" \
	&& git config --global url."https://github.com/".insteadOf "git@github.com:"

COPY package.json yarn.lock ./
RUN yarn -W --no-optional

COPY . .

ENV STORAGE_MODULE=ipfs-http-client
ENV STORAGE_URL=http://go_ipfs:5001

CMD ["npm", "run", "test:docker:run"]
