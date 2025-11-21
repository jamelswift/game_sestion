import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load `.env` explicitly relative to the repository `back-end` folder so
// Prisma can see `DATABASE_URL` even if import order is unusual.
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    // If DATABASE_URL is present in process.env, pass it explicitly to PrismaClient
    // to avoid relying on Prisma's own env loading at runtime.
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      // Allow Prisma to throw its own detailed error if DATABASE_URL is missing,
      // but surface a clearer message earlier for developer convenience.
      console.warn('PrismaService: DATABASE_URL is not defined in process.env');
    }
    // @ts-ignore - pass datasource override when available
    super(dbUrl ? { datasources: { db: { url: dbUrl } } } : {});
  }

  async onModuleInit() {
    try {
      await this.$connect();
      console.log('Database connected successfully');
    } catch (error) {
      console.error('Database connection failed:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('Database disconnected');
  }
}