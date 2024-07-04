#!/bin/bash

# Chạy lệnh yarn
yarn

# Chạy lệnh yarn build và yarn bootstrap
yarn build && yarn bootstrap

# Chạy lệnh ./skandha standalone --unsafeMode
./skandha standalone --unsafeMode
