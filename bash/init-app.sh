npm i
npm i -g pm2
pm2 install typescript
pm2 start ./index.ts --name "geesome-core"
pm2 save
sudo pm2 startup
