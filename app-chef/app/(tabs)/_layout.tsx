import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={[tabIconStyles.wrap, focused && tabIconStyles.wrapActive]}>
      <Text style={tabIconStyles.emoji}>{emoji}</Text>
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrapActive: {
    backgroundColor: 'rgba(245,158,11,0.15)',
  },
  emoji: {
    fontSize: 20,
  },
});

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#111111',
          borderTopColor: '#1E1E1E',
          borderTopWidth: 1,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: '#F59E0B',
        tabBarInactiveTintColor: '#3A3A3A',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Pedidos',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🍔" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="historial"
        options={{
          title: 'Historial',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
