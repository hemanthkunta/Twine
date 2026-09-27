import React from 'react';
import { Chat } from '../types';
import { useApp } from '../context/AppContext';
import LoginScreen from '../screens/LoginScreen';
import ChatListScreen from '../screens/ChatListScreen';
import ChatScreen from '../screens/ChatScreen';
import SettingsScreen from '../screens/SettingsScreen';

type Screen =
  | { name: 'login' }
  | { name: 'chatList' }
  | { name: 'chat'; chat: Chat }
  | { name: 'settings' };

export default function AppNavigator() {
  const { state } = useApp();
  const [screen, setScreen] = React.useState<Screen>({ name: 'login' });

  // Auto-navigate to chat list when logged in
  React.useEffect(() => {
    if (state.user && screen.name === 'login') {
      setScreen({ name: 'chatList' });
    }
    if (!state.user) {
      setScreen({ name: 'login' });
    }
  }, [state.user]);

  switch (screen.name) {
    case 'login':
      return <LoginScreen />;

    case 'chatList':
      return (
        <ChatListScreen
          onChatPress={(chat) => setScreen({ name: 'chat', chat })}
          onSettings={() => setScreen({ name: 'settings' })}
        />
      );

    case 'chat':
      return (
        <ChatScreen
          chat={screen.chat}
          onBack={() => setScreen({ name: 'chatList' })}
        />
      );

    case 'settings':
      return (
        <SettingsScreen />
      );

    default:
      return <LoginScreen />;
  }
}
