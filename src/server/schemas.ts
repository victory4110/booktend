import { z } from 'zod';

const nameSchema = z.string().trim().min(2).max(100);
const phoneSchema = z.string().trim().min(7).max(30);

export const bookingSchema = z
  .object({
    customer: nameSchema,
    email: z.email().trim().max(254).transform((value) => value.toLowerCase()),
    phone: phoneSchema,
    service: z.string().trim().min(2).max(80),
    date: z.iso.date(),
    notes: z.string().trim().max(2000).default('')
  })
  .strict();
export type BookingInput = z.infer<typeof bookingSchema>;

export const statusSchema = z.object({ status: z.enum(['New', 'In progress', 'Scheduled', 'Completed']) }).strict();
export type StatusInput = z.infer<typeof statusSchema>;

export const servicesSchema = z
  .object({
    services: z
      .array(z.string().trim().min(2).max(80))
      .min(1)
      .max(30)
      .refine((items) => new Set(items.map((item) => item.toLocaleLowerCase())).size === items.length, 'Services must be unique.')
      .optional(),
    publicListed: z.boolean().optional()
  })
  .strict()
  .refine((data) => data.services !== undefined || data.publicListed !== undefined, 'Provide services or directory visibility to update.');
export type ServicesInput = z.infer<typeof servicesSchema>;

export const loginSchema = z
  .object({
    slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    email: z.email().trim().max(254).transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(200)
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    businessName: nameSchema,
    slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    ownerName: nameSchema,
    email: z.email().trim().max(254).transform((value) => value.toLowerCase()),
    password: z.string().min(12).max(200),
    timezone: z.string().trim().min(1).max(80)
  })
  .strict();
export type SignupInput = z.infer<typeof signupSchema>;

export const avatarSchema = z
  .object({
    avatar: z.string().max(2500000).nullable()
  })
  .strict();
export type AvatarInput = z.infer<typeof avatarSchema>;
