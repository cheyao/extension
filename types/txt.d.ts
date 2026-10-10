// Plain text files are bundled as strings (webpack `asset/source`).
declare module '*.txt' {
  const content: string;
  export default content;
}
