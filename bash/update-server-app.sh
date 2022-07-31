#!/bin/bash

rm -rf geesome.zip

zip -r geesome.zip index.ts
zip -r geesome.zip publish-docs.ts
zip -r geesome.zip package.json
zip -r geesome.zip yarn.lock
zip -r geesome.zip app/

zip -r geesome.zip frontend/index.html
zip -r geesome.zip frontend/.babelrc
zip -r geesome.zip frontend/yarn.lock
zip -r geesome.zip frontend/package.json
zip -r geesome.zip frontend/tsconfig.json
zip -r geesome.zip frontend/.postcssrc.js
zip -r geesome.zip frontend/run-terser.js
zip -r geesome.zip frontend/src/
zip -r geesome.zip frontend/locale/
zip -r geesome.zip frontend/assets/

scp -P $PORT geesome.zip $HOST:$DIR

ssh -t $HOST -p $PORT "unzip -o $DIR/geesome.zip -d $DIR; cd $DIR; bash bash/docker-copy-app.sh; docker restart geesome;"
