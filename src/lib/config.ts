import fs from 'fs';
import path from 'path';

interface AppConfig {
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  PORT: number;
  HOST: string;
  APP_URL: string;
}

const defaultConfig: AppConfig = {
  DATABASE_URL: process.env.DATABASE_URL || "",
  JWT_SECRET: process.env.JWT_SECRET || "default_jwt_secret_change_me",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "default_refresh_secret_change_me",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
  PORT: parseInt(process.env.PORT || "3000"),
  HOST: process.env.HOST || "0.0.0.0",
  APP_URL: process.env.APP_URL || ""
};

let config: AppConfig = { ...defaultConfig };

try {
  const configPath = path.join(process.cwd(), 'config.json');
  if (fs.existsSync(configPath)) {
    const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config = { ...config, ...fileConfig };
  }
} catch (err) {
  console.warn("Could not load config.json, falling back to environment variables", err);
}

export { config };
