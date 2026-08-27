// Android PWA Installation Service for Twine

export class AndroidInstallerService {
  private static deferredPrompt: any = null;
  private static isInstalled = false;

  static init() {
    window.addEventListener('beforeinstallprompt', (e: any) => {
      e.preventDefault();
      this.deferredPrompt = e;
      console.log('📲 PWA Installation prompt ready.');
    });

    window.addEventListener('appinstalled', () => {
      this.isInstalled = true;
      this.deferredPrompt = null;
      console.log('🎉 Twine Web App installed on device!');
    });
  }

  static canInstall(): boolean {
    return !!this.deferredPrompt || !this.isInstalled;
  }

  static async promptInstall(): Promise<boolean> {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      this.deferredPrompt = null;
      return outcome === 'accepted';
    } else {
      console.log('ℹ️ PWA install prompt is not available or already installed.');
      return false;
    }
  }

  static triggerAutoDownloadOnRegister(_user: { display_name: string; username: string }) {
    // Only prompt PWA install if natively supported
    if (this.deferredPrompt) {
      setTimeout(() => {
        this.deferredPrompt?.prompt();
      }, 800);
    }
  }
}

AndroidInstallerService.init();
