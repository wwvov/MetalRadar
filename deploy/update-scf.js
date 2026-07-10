/**
 * MetalRadar SCF 函数更新脚本
 *
 * 用法:
 *   TENCENT_SECRET_ID=xxx TENCENT_SECRET_KEY=xxx node update-scf.js [zip路径]
 *
 * 将部署 ZIP 包上传到 COS，然后更新 SCF 函数代码。
 */

const tencentcloud = require("tencentcloud-sdk-nodejs-scf");
const Cos = require("cos-nodejs-sdk-v5");
const fs = require("fs");
const path = require("path");

// ===== 配置 =====
const REGION = process.env.TENCENT_REGION || "ap-guangzhou";
const FUNCTION_NAME = process.env.SCF_FUNCTION_NAME || "metalradar-backend";
const COS_BUCKET = process.env.COS_BUCKET || "metalradar-frontend-1452038547";
const COS_REGION = process.env.COS_REGION || "ap-guangzhou";
const ZIP_PATH = process.argv[2] || path.join(__dirname, "dist", "metalradar-scf.zip");

// ===== 腾讯云凭证 =====
const SECRET_ID = process.env.TENCENT_SECRET_ID;
const SECRET_KEY = process.env.TENCENT_SECRET_KEY;

if (!SECRET_ID || !SECRET_KEY) {
  console.error("❌ 请设置环境变量 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY");
  console.error("   macOS/Linux: export TENCENT_SECRET_ID=xxx");
  console.error("   Windows:     set TENCENT_SECRET_ID=xxx");
  process.exit(1);
}

async function main() {
  if (!fs.existsSync(ZIP_PATH)) {
    console.error(`❌ 部署包不存在: ${ZIP_PATH}`);
    console.error("   请先运行: python update_zip.py");
    process.exit(1);
  }

  const zipSize = fs.statSync(ZIP_PATH).size;
  const zipSizeMB = (zipSize / (1024 * 1024)).toFixed(1);
  console.log(`📦 部署包: ${ZIP_PATH} (${zipSizeMB} MB)`);

  // ===== 1. 上传到 COS =====
  const cosKey = `scf/metalradar-scf-${Date.now()}.zip`;

  console.log(`📤 上传到 COS: ${COS_BUCKET}/${cosKey} ...`);

  const cos = new Cos({
    SecretId: SECRET_ID,
    SecretKey: SECRET_KEY,
  });

  await new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: COS_BUCKET,
        Region: COS_REGION,
        Key: cosKey,
        Body: fs.createReadStream(ZIP_PATH),
        ContentType: "application/zip",
      },
      (err, data) => {
        if (err) reject(err);
        else resolve(data);
      }
    );
  });

  console.log(`✅ COS 上传完成: ${cosKey}`);

  // ===== 2. 更新 SCF 函数代码 =====
  console.log(`🚀 更新 SCF 函数: ${FUNCTION_NAME} ...`);

  const ScfClient = tencentcloud.scf.v20180416.Client;

  const client = new ScfClient({
    credential: {
      secretId: SECRET_ID,
      secretKey: SECRET_KEY,
    },
    region: REGION,
  });

  const result = await client.UpdateFunctionCode({
    FunctionName: FUNCTION_NAME,
    CosBucketName: COS_BUCKET,
    CosBucketRegion: COS_REGION,
    CosObjectName: cosKey,
    InstallDependency: "FALSE",
  });

  console.log(`✅ SCF 函数代码已更新: ${FUNCTION_NAME}`);
  console.log(`   RequestId: ${result.RequestId}`);

  // ===== 2.5 等待函数状态恢复为 Active =====
  console.log(`⏳ 等待函数状态就绪...`);
  let statusReady = false;
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000)); // 每 5 秒检查一次
    try {
      const statusResult = await client.GetFunction({ FunctionName: FUNCTION_NAME });
      const status = statusResult.Status;
      if (status === 'Active') {
        console.log(`   ✅ 函数状态: ${status}`);
        statusReady = true;
        break;
      }
      console.log(`   ⏳ 函数状态: ${status}，继续等待...`);
    } catch (e) {
      console.log(`   ⚠️  查询状态失败: ${e.message}，继续等待...`);
    }
  }
  if (!statusReady) {
    console.log(`   ⚠️  等待超时，仍尝试更新配置...`);
  }

  // ===== 2.6 更新函数配置：设置环境变量 =====
  console.log(`⚙️  更新函数配置...`);

  // 构建环境变量列表（从部署环境变量传入，避免覆盖控制台手动配置）
  const envVariables = [
    { Key: "DATABASE_URL", Value: "sqlite:////tmp/metalradar.db" },
  ];

  // LLM API Key（通过部署命令传入，不写死在代码中）
  if (process.env.LLM_API_KEY) {
    envVariables.push({ Key: "LLM_API_KEY", Value: process.env.LLM_API_KEY });
    console.log(`   ✅ LLM_API_KEY 已配置`);
  } else {
    console.log(`   ⚠️  未设置 LLM_API_KEY，AI 功能将不可用`);
  }

  if (process.env.LLM_BASE_URL) {
    envVariables.push({ Key: "LLM_BASE_URL", Value: process.env.LLM_BASE_URL });
  }

  if (process.env.LLM_MODEL) {
    envVariables.push({ Key: "LLM_MODEL", Value: process.env.LLM_MODEL });
  }

  // CORS 允许的来源（逗号分隔，支持自定义域名）
  if (process.env.CORS_ORIGINS) {
    envVariables.push({ Key: "CORS_ORIGINS", Value: process.env.CORS_ORIGINS });
    console.log(`   ✅ CORS_ORIGINS: ${process.env.CORS_ORIGINS}`);
  } else {
    console.log(`   ⚠️  未设置 CORS_ORIGINS，仅允许本地开发来源`);
  }

  // 带重试的配置更新（可能因函数仍在 Updating 而失败）
  let configUpdated = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const configResult = await client.UpdateFunctionConfiguration({
        FunctionName: FUNCTION_NAME,
        Environment: {
          Variables: envVariables,
        },
      });
      console.log(`✅ 函数配置已更新 (${envVariables.length} 个环境变量)`);
      console.log(`   RequestId: ${configResult.RequestId}`);
      configUpdated = true;
      break;
    } catch (e) {
      if (attempt < 4) {
        console.log(`   ⚠️  配置更新失败 (${e.message})，${5 * (attempt + 1)}s 后重试...`);
        await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
      } else {
        throw e;
      }
    }
  }

  // ===== 3. 清理 COS 上的旧部署包（保留最近 3 个）=====
  console.log("\n🧹 清理旧部署包...");
  const listResult = await new Promise((resolve, reject) => {
    cos.getBucket(
      {
        Bucket: COS_BUCKET,
        Region: COS_REGION,
        Prefix: "scf/",
      },
      (err, data) => {
        if (err) reject(err);
        else resolve(data);
      }
    );
  });

  const objects = (listResult.Contents || [])
    .filter((o) => o.Key.endsWith(".zip"))
    .sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));

  if (objects.length > 3) {
    const toDelete = objects.slice(3);
    console.log(`   删除 ${toDelete.length} 个旧包...`);
    await new Promise((resolve, reject) => {
      cos.deleteMultipleObject(
        {
          Bucket: COS_BUCKET,
          Region: COS_REGION,
          Objects: toDelete.map((o) => ({ Key: o.Key })),
        },
        (err, data) => {
          if (err) reject(err);
          else resolve(data);
        }
      );
    });
  }

  console.log("\n🎉 部署完成!");
  console.log("   冷启动后，新代码将自动执行 auto-seed");
}

main().catch((err) => {
  console.error("\n❌ 部署失败:", err.message || err);
  if (err.code) console.error(`   错误码: ${err.code}`);
  process.exit(1);
});
