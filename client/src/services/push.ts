import { ApiService } from './api';

export async function enablePush(requestPermission = true): Promise<void> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('Push notifications are not supported by this browser.');
    }
    const { publicKey } = await ApiService.getPushConfig();
    if (!publicKey) throw new Error('Push delivery is not configured on this server.');
    const permission = requestPermission ? await Notification.requestPermission() : Notification.permission;
    if (permission !== 'granted') throw new Error('Notification permission is required.');
    await navigator.serviceWorker.register('/sw.js');
    const registration = await navigator.serviceWorker.ready;
    const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const subscription = await registration.pushManager.getSubscription() ??
        await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await ApiService.subscribePush(subscription.toJSON());
}
