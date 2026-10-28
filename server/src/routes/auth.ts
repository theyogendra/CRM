import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { loadUser, requireAuth, signToken } from '../lib/auth';
import { prisma } from '../lib/db';
import { HttpError } from '../lib/http';

const router = Router();

router.post('/login', async (req, res) => {
  // trim so values copy-pasted with stray spaces still match
  const { email, password } = z
    .object({ email: z.string().trim().email(), password: z.string().trim().min(1) })
    .parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'Invalid email or password');
  res.json({ token: signToken(user.id), user: await loadUser(user.id) });
});

router.post('/register', async (req, res) => {
  // Only allowed while no users exist (first-run setup); afterwards admins add users.
  if ((await prisma.user.count()) > 0) throw new HttpError(403, 'Registration closed');
  const body = z.object({ name: z.string().trim().min(1), email: z.string().trim().email(), password: z.string().trim().min(8) }).parse(req.body);
  const user = await prisma.user.create({
    data: { name: body.name, email: body.email.toLowerCase(), passwordHash: await bcrypt.hash(body.password, 10) },
  });
  res.json({ token: signToken(user.id), user: await loadUser(user.id) });
});

/** Any signed-in user can change their own password. The current password must be confirmed first. */
router.post('/change-password', requireAuth, async (req, res) => {
  const body = z
    .object({
      currentPassword: z.string().trim().min(1, 'Enter your current password'),
      newPassword: z.string().trim().min(8, 'The new password must be at least 8 characters').max(200),
    })
    .parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
    throw new HttpError(400, 'Your current password is incorrect');
  }
  if (body.newPassword === body.currentPassword) throw new HttpError(400, 'Choose a password different from the current one');
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 10) } });
  res.json({ ok: true });
});

/** The signed-in user's real profile: name, role and what that role may do. */
router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await loadUser(req.user!.id) });
});

export default router;
