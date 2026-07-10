/**
 * MetalRadar 前端 COS 上传脚本
 *
 * 将 frontend/dist/ 上传到腾讯云 COS（新加坡），开启静态网站托管。
 * 新加坡地域无需 ICP 备案。
 *
 * 用法:
 *   TENCENT_SECRET_ID=xxx TENCENT_SECRET_KEY=xxx node deploy/upload-cos.js
 *
 * 环境变量（可选）:
 *   COS_BUCKET      — COS 存储桶名称（默认: metalradar-frontend-1452038547）
 *   COS_REGION      — COS 地域（默认: ap-singapore）
 *   DIST_DIR        — 前端构建目录（默认: frontend/dist）
 *   CACHE_CONTROL   — 静态资源缓存时间（默认: 86400，即 1 天）
 */

const Cos = require("cos-nodejs-sdk-v5");
const fs = require("fs");
const path = require("path");

// ===== 配置 =====
const SECRET_ID = process.env.TENCENT_SECRET_ID;
const SECRET_KEY = process.env.TENCENT_SECRET_KEY;
const COS_BUCKET = process.env.COS_BUCKET || "metalradar-frontend-1452038547";
const COS_REGION = process.env.COS_REGION || "ap-singapore";
const DIST_DIR = process.env.DIST_DIR || path.join(__dirname, "..", "frontend", "dist");
const CACHE_CONTROL = process.env.CACHE_CONTROL || "86400";

if (!SECRET_ID || !SECRET_KEY) {
  console.error("❌ 请设置环境变量 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY");
  process.exit(1);
}

// ===== MIME 类型映射 =====
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

// ===== 递归收集文件 =====
function collectFiles(dir, baseDir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      collectFiles(fullPath, baseDir, fileList);
    } else {
      fileList.push({ fullPath, relativePath });
    }
  }
  return fileList;
}

// ===== 静态资源缓存策略 =====
function getCacheControl(filePath) {
  // HTML 文件不缓存（确保即时更新）
  if (filePath.endsWith(".html")) {
    return "no-cache";
  }
  // 带 hash 的 JS/CSS 资源可长期缓存
  if (/\.(js|css|mjs)$/.test(filePath)) {
    return `public, max-age=${CACHE_CONTROL}, immutable`;
  }
  return `public, max-age=${CACHE_CONTROL}`;
}

async function main() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error(`❌ 构建目录不存在: ${DIST_DIR}`);
    console.error("   请先运行: cd frontend && npm run build");
    process.exit(1);
  }

  const cos = new Cos({
    SecretId: SECRET_ID,
    SecretKey: SECRET_KEY,
  });

  // ===== 1. 收集所有文件 =====
  const files = collectFiles(DIST_DIR, DIST_DIR);
  console.log(`📦 共 ${files.length} 个文件待上传`);
  console.log(`   目标: ${COS_BUCKET} (${COS_REGION})`);

  // ===== 2. 上传文件 =====
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const key = file.relativePath;
    const mimeType = getMimeType(file.fullPath);
    const cacheControl = getCacheControl(file.relativePath);

    try {
      await new Promise((resolve, reject) => {
        cos.putObject(
          {
            Bucket: COS_BUCKET,
            Region: COS_REGION,
            Key: key,
            Body: fs.createReadStream(file.fullPath),
            ContentType: mimeType,
            CacheControl: cacheControl,
          },
          (err, data) => {
            if (err) reject(err);
            else resolve(data);
          }
        );
      });
      uploaded++;
      if (uploaded % 10 === 0) {
        console.log(`   📤 已上传 ${uploaded}/${files.length} ...`);
      }
    } catch (err) {
      failed++;
      console.error(`   ❌ 上传失败: ${key} — ${err.message || err}`);
    }
  }

  console.log(`✅ 上传完成: ${uploaded} 成功, ${failed} 失败`);

  if (failed > 0) {
    console.error(`❌ ${failed} 个文件上传失败，请检查后重试`);
    process.exit(1);
  }

  // ===== 3. 配置静态网站托管 =====
  console.log("\n⚙️  配置静态网站托管...");
  try {
    await new Promise((resolve, reject) => {
      cos.putBucketWebsite(
        {
          Bucket: COS_BUCKET,
          Region: COS_REGION,
          WebsiteConfiguration: {
            IndexDocument: {
              Suffix: "index.html",
            },
            ErrorDocument: {
              Key: "index.html", // SPA 路由：所有路径返回 index.html
            },
          },
        },
        (err, data) => {
          if (err) reject(err);
          else resolve(data);
        }
      );
    });
    console.log("✅ 静态网站托管已启用");
    console.log("   索引文档: index.html");
    console.log("   错误文档: index.html (SPA 路由支持)");
  } catch (err) {
    // 权限不足时显示手动配置提示
    if (err.statusCode === 403 || err.code === "AccessDenied") {
      console.log("⚠️  静态网站托管配置失败（权限不足），请手动在 COS 控制台配置：");
      console.log("   基础配置 → 静态网站 → 开启");
      console.log("   索引文档: index.html");
      console.log("   错误文档: index.html");
    } else {
      console.error(`⚠️  静态网站托管配置异常: ${err.message || err}`);
    }
  }

  // ===== 4. 获取访问域名 =====
  const websiteUrl = `https://${COS_BUCKET}.cos-website.${COS_REGION}.myqcloud.com`;
  console.log("\n🌐 访问信息:");
  console.log(`   COS 静态网站域名: ${websiteUrl}`);

  console.log("\n📋 后续步骤:");
  console.log("   1. 购买域名（腾讯云 .top 域名约 10元/年）");
  console.log("   2. COS 控制台 → 域名管理 → 绑定自定义域名");
  console.log("   3. DNS 添加 CNAME 记录指向 COS 域名");
  console.log("   4. 申请免费 SSL 证书（腾讯云自动）");
  console.log("   5. 在 SCF 环境变量中设置:");
  console.log("      CORS_ORIGINS=https://你的域名,https://wwvov.github.io");
  console.log("\n   🎯 新加坡地域 COS 无需 ICP 备案，购买域名后即可直接访问");

  console.log("\n🎉 上传完成!");
}

main().catch((err) => {
  console.error("\n❌ 上传失败:", err.message || err);
  if (err.code) console.error(`   错误码: ${err.code}`);
  process.exit(1);
});
