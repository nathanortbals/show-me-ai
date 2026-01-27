import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'langchain',
    '@langchain/core',
    '@langchain/community',
    '@langchain/langgraph',
    '@langchain/langgraph-checkpoint-postgres',
    '@langchain/openai',
  ],
};

export default nextConfig;
