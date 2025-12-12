/**
 * Copyright 2025 NodeRef
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../lib/prisma.js';
import { UserRepository } from '../repositories/userRepository.js';

let defaultPrisma: PrismaClient | null = null;

async function getDefaultPrisma(): Promise<PrismaClient> {
  if (!defaultPrisma) {
    defaultPrisma = await getPrismaClient();
  }
  return defaultPrisma;
}

export async function getAiAssistantEnabled(userId: number): Promise<boolean> {
  const prisma = await getDefaultPrisma();
  const repository = new UserRepository(prisma);
  return repository.getAiAssistantEnabled(userId);
}

export async function setAiAssistantEnabled(userId: number, enabled: boolean): Promise<void> {
  const prisma = await getDefaultPrisma();
  const repository = new UserRepository(prisma);
  return repository.setAiAssistantEnabled(userId, enabled);
}

export async function getUser(userId: number): Promise<{
  id: number;
  username: string;
  fullName: string | null;
  email: string | null;
  thumbnail: string | null;
} | null> {
  const prisma = await getDefaultPrisma();
  const repository = new UserRepository(prisma);
  return repository.getProfile(userId);
}

export async function updateUserProfile(
  userId: number,
  data: { fullName?: string | null; thumbnail?: string | null }
): Promise<void> {
  const prisma = await getDefaultPrisma();
  const repository = new UserRepository(prisma);
  await repository.updateProfile(userId, data);
}

// Backward compatibility helper
export async function updateUserFullName(userId: number, fullName: string | null): Promise<void> {
  return updateUserProfile(userId, { fullName });
}
