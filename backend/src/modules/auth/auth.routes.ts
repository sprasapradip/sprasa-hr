import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authLimiter, verifyCsrf } from '../../middleware/security';
import * as c from './auth.controller';

export const authRoutes = Router();

authRoutes.get('/csrf', c.csrf);
authRoutes.post('/login', authLimiter, c.login);
authRoutes.post('/refresh', verifyCsrf, c.refresh);
authRoutes.post('/logout', verifyCsrf, c.logout);
authRoutes.post('/forgot-password', authLimiter, c.forgotPassword);
authRoutes.post('/reset-password', authLimiter, c.resetPassword);
authRoutes.post('/verify-email', authLimiter, c.verifyEmail);

authRoutes.get('/me', authenticate, c.me);
authRoutes.get('/login-history', authenticate, c.loginHistory);
authRoutes.post('/change-password', authenticate, authLimiter, c.changePassword);
authRoutes.post('/send-verification', authenticate, authLimiter, c.sendVerification);
