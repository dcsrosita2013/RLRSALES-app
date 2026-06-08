import { Router } from 'express';
import * as authController from './auth.controller';
import { requireAuth } from '../../middleware/auth';

const router = Router();

router.post('/login', authController.login);
router.get('/me', requireAuth, authController.me);
router.post('/change-password', requireAuth, authController.changePassword);
router.get('/me/signature', requireAuth, authController.getSignature);
router.put('/me/signature', requireAuth, authController.setSignature);

export default router;
