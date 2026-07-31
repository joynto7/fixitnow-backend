import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { signToken } from '../../utils/jwt';

interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: Extract<Role, 'CUSTOMER' | 'TECHNICIAN'>;
}

const SALT_ROUNDS = 10;

export const registerUser = async (input: RegisterInput) => {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, 'An account with this email already exists');
  }

  const hashedPassword = await bcrypt.hash(input.password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      password: hashedPassword,
      phone: input.phone,
      role: input.role,
      ...(input.role === 'TECHNICIAN' ? { technicianProfile: { create: {} } } : {}),
    },
    include: { technicianProfile: true },
  });

  const token = signToken({ userId: user.id, role: user.role });
  return { user, token };
};

export const loginUser = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { email }, include: { technicianProfile: true } });
  if (!user) {
    throw new AppError(401, 'Invalid email or password');
  }
  if (user.status === 'BANNED') {
    throw new AppError(403, 'Your account has been banned. Contact support.');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new AppError(401, 'Invalid email or password');
  }

  const token = signToken({ userId: user.id, role: user.role });
  return { user, token };
};
