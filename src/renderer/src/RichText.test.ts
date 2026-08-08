// 票 09:富文本标记的解析。
//
// 这条 seam 的价值在于**让一句话保持一个 key**——各语言语序不同,强调的位置随之移动,
// 而碎片 key 拼接做不到这一点。故用例既验标记解析,也验"标记在句中任意位置都成立"。
//
// 用 createElement 而非 JSX:仓库的 vitest 只收 `*.test.ts`,不改配置去迁就一个测试。
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RichText } from './RichText'

const html = (text: string): string => renderToStaticMarkup(createElement(RichText, { text }))

describe('RichText', () => {
  it('**粗体** 渲染成 <b>', () => {
    expect(html('前**中**后')).toBe('<span>前</span><b>中</b><span>后</span>')
  })

  it('`代码` 渲染成 <code>', () => {
    expect(html('见 `encrypted_content` 字段')).toContain('<code>encrypted_content</code>')
  })

  it('强调位于句首、句中、句尾都成立', () => {
    // 这条是本组件存在的理由:六语语序不同,强调的位置随之移动。
    // 若实现假设标记只在中间(如用固定的三段切分),句首/句尾会漏
    expect(html('**开头**其余')).toBe('<b>开头</b><span>其余</span>')
    expect(html('其余**结尾**')).toBe('<span>其余</span><b>结尾</b>')
  })

  it('同一句里多处强调各自成立', () => {
    expect(html('**甲**与**乙**')).toBe('<b>甲</b><span>与</span><b>乙</b>')
  })

  it('无标记时原样输出,不吞字', () => {
    expect(html('普通一句话')).toBe('<span>普通一句话</span>')
  })

  it('落单的标记字符不当作标记,原样显示', () => {
    // 措辞里出现单个星号不该让整句错乱
    expect(html('折扣 5*3 元')).toBe('<span>折扣 5*3 元</span>')
  })

  it('HTML 特殊字符被转义,不产生标签', () => {
    // 参数里可能带用户数据(会话标题等);走 JSX 文本节点即由 React 转义
    expect(html('<img src=x onerror=1>')).not.toContain('<img ')
  })
})
