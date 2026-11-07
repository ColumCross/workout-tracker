import { Fragment } from "react";
import { Linking, StyleSheet } from "react-native";
import { Text, useTheme } from "react-native-paper";

import { policyBlocks, type PolicyBlock } from "./policy";

export function PolicyDocument() {
  return (
    <>
      {policyBlocks.map((block, index) => (
        <PolicyBlockView block={block} index={index} key={`${block.type}-${index}`} />
      ))}
    </>
  );
}

function PolicyBlockView({ block, index }: { block: PolicyBlock; index: number }) {
  const theme = useTheme();
  const textStyle = { color: theme.colors.onSurface };

  if (block.type === "heading") {
    const variant = block.level === 1 ? "headlineMedium" : "titleLarge";
    return <Text variant={variant} style={[styles.heading, textStyle]}>{inlineText(block.text, `${index}-heading`)}</Text>;
  }

  if (block.type === "list") {
    return (
      <>
        {block.items.map((item, itemIndex) => (
          <Text key={`${index}-${itemIndex}`} style={[styles.listItem, textStyle]}>{inlineText(item, `${index}-${itemIndex}`)}</Text>
        ))}
      </>
    );
  }

  return <Text style={textStyle}>{inlineText(block.text, `${index}-paragraph`)}</Text>;
}

function inlineText(value: string, key: string) {
  return value.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <Text key={`${key}-${index}`} style={styles.bold}>{part.slice(2, -2)}</Text>;
    }

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return <Text key={`${key}-${index}`} style={styles.link} onPress={() => void Linking.openURL(link[2])}>{link[1]}</Text>;
    }

    return <Fragment key={`${key}-${index}`}>{part}</Fragment>;
  });
}

const styles = StyleSheet.create({
  bold: { fontWeight: "700" },
  heading: { marginTop: 12 },
  link: { color: "#208AEF", textDecorationLine: "underline" },
  listItem: { paddingLeft: 16 },
});
