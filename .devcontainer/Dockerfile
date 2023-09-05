ARG CRYSTAL_IMAGE_TAG
ARG NODE_IMAGE_TAG

FROM node:${NODE_IMAGE_TAG} AS node-build

FROM crystallang/crystal:${CRYSTAL_IMAGE_TAG} AS runner


RUN apt update && apt install libsqlite3-dev libevent-dev -y
RUN apt update && apt install bash sudo -y

RUN groupadd vscode && useradd -g vscode -G sudo -m -s /bin/bash vscode

# Allow members of the sudo group to execute commands as root without password
RUN echo '%sudo ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

COPY --from=node-build /usr/local/bin/node /usr/local/bin/node
COPY --from=node-build /usr/local/lib/node_modules /usr/local/lib/node_modules

RUN ln -s /usr/local/bin/node /usr/local/bin/nodejs
RUN ln -s /usr/local/lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
RUN ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
