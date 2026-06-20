/**
 * Symbiote canary app. Note the imports: View and Text come from
 * @symbiote/react, not react-native. This tree is rendered by our own
 * react-reconciler host config straight onto Fabric — React Native's renderer
 * is never involved.
 *
 * @format
 */

import { useState } from 'react';
import { View, Text } from '@symbiote/react';

function App() {
  const [count, setCount] = useState(0);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0b1622',
      }}>
      <Text style={{ color: '#7fb5ff', fontSize: 16 }}>symbiote · react canary</Text>
      <View
        onPress={() => setCount(value => value + 1)}
        style={{
          marginTop: 24,
          paddingHorizontal: 32,
          paddingVertical: 20,
          borderRadius: 16,
          backgroundColor: '#2b6cb0',
        }}>
        <Text style={{ color: '#ffffff', fontSize: 28, fontWeight: 'bold' }}>
          {`tapped ${count}×`}
        </Text>
      </View>
    </View>
  );
}

export default App;
