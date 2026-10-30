// mammoth's prebuilt browser bundle has the same API as its Node entry.
declare module 'mammoth/mammoth.browser.min.js' {
  import mammoth from 'mammoth';
  export default mammoth;
}
