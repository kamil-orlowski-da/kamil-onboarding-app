import {expect, type Page, type Locator} from '@playwright/test';
import Wallet from './wallet.page.ts';
import Tenants from "./sections/tenants.tab";
import Login from './sections/login.ts';

export default class QS {
  loginPage: Login
  tenants: Tenants
  wallet: Wallet
  private page: Page;

  constructor(page: Page) {
    this.page = page;
    this.loginPage = new Login(page);
    this.tenants = new Tenants(page);
    this.wallet = new Wallet(page);
  }

  public async waitForSuccessMessage(message: string): Promise<void> {
    const success = this.page.getByText(`Success: ${message}`);
    await expect(success).toBeVisible();
    await this.page.locator('#liveToast').getByRole('button', { name: 'Close' }).click();
  }

  public async waitForURL(url: string | RegExp): Promise<void> {
    await this.page.waitForURL(url);
  }
}