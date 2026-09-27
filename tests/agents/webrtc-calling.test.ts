import { test, expect } from '@playwright/test';
import { TestAgent, DEMO_USERS, SELECTORS, createTestAgents } from './base';

test.describe('WebRTC Calling Tests', () => {
  test('alice initiates voice call to bob', async ({ browser }) => {
    const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
    const [alice, bob] = agents;
    
    try {
      await alice.navigateToApp();
      await bob.navigateToApp();
      await alice.login('alice');
      await bob.login('bob');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      await alice.selectChat('Bob Vance');
      
      const callButton = alice['page'].locator(SELECTORS.callButton);
      await expect(callButton).toBeVisible({ timeout: 10000 });
      
      await callButton.click();
      
      const callModal = alice['page'].locator('[data-testid="call-modal"]');
      await expect(callModal).toBeVisible({ timeout: 10000 });
      
      await bob['page'].waitForSelector('[data-testid="incoming-call"]', { timeout: 15000 });
      
      await alice['page'].waitForTimeout(2000);
      
      await callModal.locator('button:has-text("End Call")').click();
      
      await expect(callModal).not.toBeVisible({ timeout: 5000 });
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('alice initiates video call to bob', async ({ browser }) => {
    const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
    const [alice, bob] = agents;
    
    try {
      await alice.navigateToApp();
      await bob.navigateToApp();
      await alice.login('alice');
      await bob.login('bob');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      await alice.selectChat('Bob Vance');
      
      const videoCallButton = alice['page'].locator(SELECTORS.videoCallButton);
      await expect(videoCallButton).toBeVisible({ timeout: 10000 });
      
      await videoCallButton.click();
      
      const callModal = alice['page'].locator('[data-testid="call-modal"]');
      await expect(callModal).toBeVisible({ timeout: 10000 });
      
      await bob['page'].waitForSelector('[data-testid="incoming-call"]', { timeout: 15000 });
      
      await expect(callModal.locator('text=Video')).toBeVisible();
      
      await callModal.locator('button:has-text("End Call")').click();
      
      await expect(callModal).not.toBeVisible({ timeout: 5000 });
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('bob accepts incoming call', async ({ browser }) => {
    const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
    const [alice, bob] = agents;
    
    try {
      await alice.navigateToApp();
      await bob.navigateToApp();
      await alice.login('alice');
      await bob.login('bob');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      await alice.selectChat('Bob Vance');
      
      const callButton = alice['page'].locator(SELECTORS.callButton);
      await callButton.click();
      
      const incomingCall = bob['page'].locator('[data-testid="incoming-call"]');
      await expect(incomingCall).toBeVisible({ timeout: 15000 });
      
      await incomingCall.locator('button:has-text("Accept")').click();
      
      const callModal = bob['page'].locator('[data-testid="call-modal"]');
      await expect(callModal).toBeVisible({ timeout: 10000 });
      
      await callModal.locator('button:has-text("End Call")').click();
      
      await expect(callModal).not.toBeVisible({ timeout: 5000 });
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('bob rejects incoming call', async ({ browser }) => {
    const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
    const [alice, bob] = agents;
    
    try {
      await alice.navigateToApp();
      await bob.navigateToApp();
      await alice.login('alice');
      await bob.login('bob');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      await alice.selectChat('Bob Vance');
      
      const callButton = alice['page'].locator(SELECTORS.callButton);
      await callButton.click();
      
      const incomingCall = bob['page'].locator('[data-testid="incoming-call"]');
      await expect(incomingCall).toBeVisible({ timeout: 15000 });
      
      await incomingCall.locator('button:has-text("Decline")').click();
      
      await expect(incomingCall).not.toBeVisible({ timeout: 5000 });
      
      const aliceCallModal = alice['page'].locator('[data-testid="call-modal"]');
      await expect(aliceCallModal.locator('text=Declined')).toBeVisible({ timeout: 5000 });
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('call toggle video during call', async ({ browser }) => {
    const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
    const [alice, bob] = agents;
    
    try {
      await alice.navigateToApp();
      await bob.navigateToApp();
      await alice.login('alice');
      await bob.login('bob');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      await alice.selectChat('Bob Vance');
      
      const callButton = alice['page'].locator(SELECTORS.callButton);
      await callButton.click();
      
      const incomingCall = bob['page'].locator('[data-testid="incoming-call"]');
      await expect(incomingCall).toBeVisible({ timeout: 15000 });
      await incomingCall.locator('button:has-text("Accept")').click();
      
      const aliceCallModal = alice['page'].locator('[data-testid="call-modal"]');
      const toggleVideo = aliceCallModal.locator('button[title*="Video"]');
      
      if (await toggleVideo.isVisible({ timeout: 3000 })) {
        await toggleVideo.click();
        await expect(toggleVideo.locator('text=Video Off')).toBeVisible({ timeout: 3000 });
        await toggleVideo.click();
        await expect(toggleVideo.locator('text=Video On')).toBeVisible({ timeout: 3000 });
      }
      
      await aliceCallModal.locator('button:has-text("End Call")').click();
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('call mute/unmute', async ({ browser }) => {
    const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
    const [alice, bob] = agents;
    
    try {
      await alice.navigateToApp();
      await bob.navigateToApp();
      await alice.login('alice');
      await bob.login('bob');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      await alice.selectChat('Bob Vance');
      
      const callButton = alice['page'].locator(SELECTORS.callButton);
      await callButton.click();
      
      const incomingCall = bob['page'].locator('[data-testid="incoming-call"]');
      await expect(incomingCall).toBeVisible({ timeout: 15000 });
      await incomingCall.locator('button:has-text("Accept")').click();
      
      const aliceCallModal = alice['page'].locator('[data-testid="call-modal"]');
      const muteButton = aliceCallModal.locator('button[title*="Mute"]');
      
      if (await muteButton.isVisible({ timeout: 3000 })) {
        await muteButton.click();
        await expect(muteButton.locator('text=Unmute')).toBeVisible({ timeout: 3000 });
        await muteButton.click();
        await expect(muteButton.locator('text=Mute')).toBeVisible({ timeout: 3000 });
      }
      
      await aliceCallModal.locator('button:has-text("End Call")').click();
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });
});