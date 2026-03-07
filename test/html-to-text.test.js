import { describe, it, expect } from "bun:test";
import { htmlToText } from "../src/html-to-text.js";

describe("htmlToText", () => {
  it("returns empty string for empty input", () => {
    expect(htmlToText("")).toBe("");
  });

  it("strips <style> blocks entirely", () => {
    const html = "<style>body { color: red; }</style>hello";
    expect(htmlToText(html)).toBe("hello");
  });

  it("strips <script> blocks entirely", () => {
    const html = "<script>alert('xss')</script>world";
    expect(htmlToText(html)).toBe("world");
  });

  it("converts <br> to newline", () => {
    expect(htmlToText("line1<br>line2")).toBe("line1\nline2");
  });

  it("converts self-closing <br/> to newline", () => {
    expect(htmlToText("line1<br/>line2")).toBe("line1\nline2");
  });

  it("converts </p> to double newline", () => {
    expect(htmlToText("<p>para1</p><p>para2</p>")).toBe("para1\n\npara2");
  });

  it("converts </div> to newline", () => {
    expect(htmlToText("<div>row1</div><div>row2</div>")).toBe("row1\nrow2");
  });

  it("strips remaining HTML tags", () => {
    expect(htmlToText("<strong>bold</strong> text")).toBe("bold text");
  });

  it("decodes &amp; entity", () => {
    expect(htmlToText("foo &amp; bar")).toBe("foo & bar");
  });

  it("decodes &lt; and &gt; entities", () => {
    expect(htmlToText("&lt;tag&gt;")).toBe("<tag>");
  });

  it("decodes &nbsp; entity to space", () => {
    expect(htmlToText("a&nbsp;b")).toBe("a b");
  });

  it("decodes numeric decimal entity &#39;", () => {
    expect(htmlToText("it&#39;s")).toBe("it's");
  });

  it("decodes numeric hex entity &#x27;", () => {
    expect(htmlToText("it&#x27;s")).toBe("it's");
  });

  it("collapses multiple spaces into one", () => {
    expect(htmlToText("a   b")).toBe("a b");
  });

  it("preserves newlines while collapsing adjacent whitespace", () => {
    const result = htmlToText("line1<br>  line2");
    expect(result).toBe("line1\nline2");
  });

  it("collapses more than two consecutive newlines to two", () => {
    const result = htmlToText("a<br><br><br><br>b");
    expect(result).toBe("a\n\nb");
  });

  it("trims leading and trailing whitespace", () => {
    expect(htmlToText("  hello  ")).toBe("hello");
  });

  it("converts </h1> through </h6> to double newline", () => {
    expect(htmlToText("<h1>Title</h1>text")).toBe("Title\n\ntext");
    expect(htmlToText("<h3>Section</h3>text")).toBe("Section\n\ntext");
  });
});
