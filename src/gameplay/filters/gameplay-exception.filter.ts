import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorDto } from '../dto/api.dto';

/**
 * Global Exception Filter สำหรับ Gameplay API
 * จัดการข้อผิดพลาดทั้งหมดและส่งกลับในรูปแบบมาตรฐาน
 */
@Catch()
export class GameplayExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GameplayExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: HttpStatus;
    let message: string;
    let error: string;
    let details: any;

    if (exception instanceof HttpException) {
      // HTTP Exception (จาก NestJS)
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as any;
        message = responseObj.message || responseObj.error || 'An error occurred';
        error = responseObj.error || exception.name;
        details = responseObj.details;
      } else {
        message = 'An error occurred';
        error = exception.name;
      }
    } else if (exception instanceof Error) {
      // Standard Error
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = exception.message || 'Internal server error';
      error = exception.name || 'Error';
      
      // Log stack trace สำหรับ debugging
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
    } else {
      // Unknown exception
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An unknown error occurred';
      error = 'UnknownError';
      
      this.logger.error('Unknown exception:', exception);
    }

    // สร้าง standardized error response
    const errorResponse: ApiErrorDto = {
      statusCode: status,
      message,
      error,
      details,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Log error สำหรับ debugging
    this.logger.error(
      `HTTP ${status} Error: ${message} - ${request.method} ${request.url}`,
      {
        exception: exception instanceof Error ? exception.stack : exception,
        request: {
          method: request.method,
          url: request.url,
          body: request.body,
          params: request.params,
          query: request.query,
        },
      }
    );

    response.status(status).json(errorResponse);
  }
}

/**
 * Custom Exceptions สำหรับ Gameplay Module
 */

/**
 * Exception สำหรับกรณีที่ไม่พบข้อมูลผู้เล่น
 */
export class PlayerNotFoundException extends HttpException {
  constructor(playerId: number | string) {
    super(
      {
        message: `Player with ID ${playerId} not found`,
        error: 'PlayerNotFound',
        details: { playerId },
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * Exception สำหรับกรณีที่ไม่พบข้อมูลเซสชั่น
 */
export class SessionNotFoundException extends HttpException {
  constructor(sessionId: number | string) {
    super(
      {
        message: `Session with ID ${sessionId} not found`,
        error: 'SessionNotFound',
        details: { sessionId },
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * Exception สำหรับกรณีที่การดำเนินการของเกมไม่ถูกต้อง
 */
export class InvalidGameActionException extends HttpException {
  constructor(action: string, reason: string) {
    super(
      {
        message: `Invalid game action: ${action}`,
        error: 'InvalidGameAction',
        details: { action, reason },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Exception สำหรับกรณีที่ข้อมูลการ์ดไม่ถูกต้อง
 */
export class InvalidCardException extends HttpException {
  constructor(cardId: number | string, reason?: string) {
    super(
      {
        message: `Invalid card operation for card ID ${cardId}`,
        error: 'InvalidCard',
        details: { cardId, reason },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Exception สำหรับกรณีที่ข้อมูลตลาดไม่พร้อมใช้งาน
 */
export class MarketDataUnavailableException extends HttpException {
  constructor(reason?: string) {
    super(
      {
        message: 'Market data is currently unavailable',
        error: 'MarketDataUnavailable',
        details: { reason },
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

/**
 * Exception สำหรับกรณีที่ข้อมูลการตัดสินใจไม่ถูกต้อง
 */
export class InvalidChoiceException extends HttpException {
  constructor(choiceId: string, reason: string) {
    super(
      {
        message: `Invalid choice: ${choiceId}`,
        error: 'InvalidChoice',
        details: { choiceId, reason },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}