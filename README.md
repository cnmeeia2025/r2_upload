
![](https://mick.19510272.xyz/1740554018907-2.png)




1. ##### 克隆项目

   ```sh
   git clone https://github.com/cnmeeia2025/r2_upload.git
   ```

   ```shell
   cd r2_upload
   ```

2. ##### 安装依赖

   ```sh
   npm install
   ```

   ##### 或使用 yarn

   ```sh
   yarn install
   ```

3. ##### 配置环境变量

   ```sh
    .env
   ```

#### 构建 docker image

##### 1. 构建镜像

```sh
docker build -t r2-uploader:latest .
```

##### 2. 运行容器

```sh
docker run -d \

--name r2-uploader \

-p 3000:3000 \

-e ACCOUNT_ID=your_account_id \

-e R2_ACCESS_KEY_ID=your_access_key \

-e R2_SECRET_ACCESS_KEY=your_secret_key \

-e R2_BUCKET_NAME=your_bucket_name \

-e R2_PUBLIC_URL=your_public_url \

r2-uploader:latest
```

##### 3. 查看日志

```sh
docker logs -f r2-uploader
```

##### 4. 停止容器

```sh
docker stop r2-uploader

docker rm r2-uploader
```

