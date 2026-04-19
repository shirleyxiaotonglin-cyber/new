/** DirectThread 使用：userLowId &lt; userHighId（字典序）稳定唯一 */
export function sortedUserPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
