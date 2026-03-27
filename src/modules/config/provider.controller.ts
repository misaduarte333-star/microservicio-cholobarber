import { Request, Response } from 'express';
import { ProviderService, ProviderName } from './provider.service';

const VALID_PROVIDERS: ProviderName[] = ['openai', 'anthropic', 'google'];

export class ProviderController {
  static async getConfig(_req: Request, res: Response) {
    const [config, statuses] = await Promise.all([
      ProviderService.getConfig(),
      ProviderService.getAllStatuses(),
    ]);
    res.json({ config, statuses });
  }

  static async setActive(req: Request, res: Response) {
    const { provider, model } = req.body;
    if (!VALID_PROVIDERS.includes(provider)) {
      res.status(400).json({ ok: false, error: 'Proveedor inválido' });
      return;
    }
    await ProviderService.setActive(provider as ProviderName, model);
    res.json({ ok: true, provider, model });
  }

  static async saveKey(req: Request, res: Response) {
    const { provider, key } = req.body;
    if (!VALID_PROVIDERS.includes(provider) || !key?.trim()) {
      res.status(400).json({ ok: false, error: 'Proveedor o key inválidos' });
      return;
    }
    await ProviderService.saveApiKey(provider as ProviderName, key.trim());
    res.json({ ok: true, masked: ProviderService.mask(key.trim()) });
  }

  static async testProvider(req: Request, res: Response) {
    const { provider, model } = req.body;
    if (!VALID_PROVIDERS.includes(provider)) {
      res.status(400).json({ ok: false, error: 'Proveedor inválido' });
      return;
    }
    const result = await ProviderService.testProvider(provider as ProviderName, model);
    res.json(result);
  }
}
