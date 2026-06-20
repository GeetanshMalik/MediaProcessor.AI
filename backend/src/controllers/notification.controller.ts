import { Request, Response } from 'express';
import { prisma } from '../database/db';

/**
 * Fetch all notifications for the authenticated user
 */
export async function getNotifications(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.'
        }
      });
    }

    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not fetch notifications.'
      }
    });
  }
}

/**
 * Mark a single notification as read
 */
export async function markAsRead(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.'
        }
      });
    }

    const { id } = req.params;

    const notification = await prisma.notification.findUnique({
      where: { id }
    });

    if (!notification) {
      return res.status(404).json({
        error: {
          code: 'NOTIFICATION_NOT_FOUND',
          message: `Notification with ID ${id} not found.`
        }
      });
    }

    // Ensure the notification belongs to this user
    if (notification.userId !== req.user.id) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to modify this notification.'
        }
      });
    }

    const updatedNotification = await prisma.notification.update({
      where: { id },
      data: { isRead: true }
    });

    return res.status(200).json({ notification: updatedNotification });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not update notification.'
      }
    });
  }
}

/**
 * Mark all notifications as read for the user
 */
export async function markAllAsRead(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.'
        }
      });
    }

    await prisma.notification.updateMany({
      where: {
        userId: req.user.id,
        isRead: false
      },
      data: { isRead: true }
    });

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read.'
    });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not update notifications.'
      }
    });
  }
}
