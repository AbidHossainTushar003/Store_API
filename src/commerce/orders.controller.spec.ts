import { ServiceUnavailableException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LocalDemoAuthService } from '../local-demo-auth/local-demo-auth.service';
import { GuestSessionService } from './guest-session.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

describe('OrdersController', () => {
  it('blocks checkout before creating a guest session when delivery collection is not configured', async () => {
    const getOrCreate = jest.fn();
    const placeOrder = jest.fn();
    const controller = new OrdersController(
      { placeOrder } as unknown as OrdersService,
      { getOrCreate } as unknown as GuestSessionService,
      { isEnabled: () => false } as unknown as LocalDemoAuthService,
    );

    await expect(controller.placeOrder(
      {} as never,
      {} as Request,
      {} as Response,
    )).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(getOrCreate).not.toHaveBeenCalled();
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it('keeps local demo COD checkout available', async () => {
    const getOrCreate = jest.fn().mockResolvedValue('guest-session');
    const placeOrder = jest.fn().mockResolvedValue({ order: { id: 'order-1' } });
    const controller = new OrdersController(
      { placeOrder } as unknown as OrdersService,
      { getOrCreate } as unknown as GuestSessionService,
      { isEnabled: () => true } as unknown as LocalDemoAuthService,
    );
    const input = { items: [] } as never;

    await expect(controller.placeOrder(input, {} as Request, {} as Response))
      .resolves.toEqual({ order: { id: 'order-1' } });
    expect(getOrCreate).toHaveBeenCalledTimes(1);
    expect(placeOrder).toHaveBeenCalledWith('guest-session', input);
  });
});
