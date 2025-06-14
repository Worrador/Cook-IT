import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const Card = ({ children, style }) => (
  <View style={[styles.card, style]}>
    {children}
  </View>
);

export const CardHeader = ({ children, style }) => (
  <View style={[styles.header, style]}>
    {children}
  </View>
);

export const CardContent = ({ children, style }) => (
  <View style={[styles.content, style]}>
    {children}
  </View>
);

export const CardFooter = ({ children, style }) => (
  <View style={[styles.footer, style]}>
    {children}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    marginBottom: 8,
  },
  content: {
    marginVertical: 8,
  },
  footer: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});