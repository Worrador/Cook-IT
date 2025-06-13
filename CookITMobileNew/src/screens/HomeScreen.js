import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';

export default function HomeScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>CookIT</Text>
      <Text variant="bodyLarge" style={styles.subtitle}>Your Cooking Assistant</Text>

      <View style={styles.buttonContainer}>
        <Button
          mode="contained"
          onPress={() => navigation.navigate('RecipeList')}
          style={styles.button}
        >
          My Recipes
        </Button>

        <Button
          mode="contained"
          onPress={() => {}}
          style={styles.button}
        >
          Shopping List
        </Button>

        <Button
          mode="contained"
          onPress={() => {}}
          style={styles.button}
        >
          Meal Planner
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 10,
    color: '#2c3e50',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 40,
    color: '#7f8c8d',
  },
  buttonContainer: {
    gap: 15,
  },
  button: {
    marginVertical: 5,
  },
});