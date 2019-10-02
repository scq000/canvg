import {
	toNumberArray,
	compressSpaces
} from '../util';
import Font from '../Font';
import BoundingBox from '../BoundingBox';
import Document from './Document';
import Element from './Element';
import FontElement from './FontElement';
import GlyphElement from './GlyphElement';
import RenderedElement from './RenderedElement';

export default class TextElement extends RenderedElement {

	type = 'text';
	protected x = 0;
	protected y = 0;

	constructor(
		document: Document,
		node: HTMLElement,
		captureTextNodes?: boolean
	) {

		super(
			document,
			node,
			new.target === TextElement
				? true
				: captureTextNodes
		);
	}

	setContext(ctx: CanvasRenderingContext2D, _?: boolean) {

		super.setContext(ctx);

		const textBaseline = this.getStyle('dominant-baseline').getTextBaseline()
			|| this.getStyle('alignment-baseline').getTextBaseline();

		if (textBaseline) {
			ctx.textBaseline = textBaseline as any;
		}
	}

	protected initializeCoordinates(ctx: CanvasRenderingContext2D) {

		this.x = this.getAttribute('x').getPixels('x');
		this.y = this.getAttribute('y').getPixels('y');

		const dxAttr = this.getAttribute('dx');
		const dyAttr = this.getAttribute('dy');

		if (dxAttr.hasValue()) {
			this.x += dxAttr.getPixels('x');
		}

		if (dyAttr.hasValue()) {
			this.y += dyAttr.getPixels('y');
		}

		this.x += this.getAnchorDelta(ctx, this, 0);
	}

	getBoundingBox(ctx: CanvasRenderingContext2D) {

		if (this.type !== 'text') {
			return this.getTElementBoundingBox(ctx);
		}

		this.initializeCoordinates(ctx);

		let boundingBox: BoundingBox = null;

		this.children.forEach((_, i) => {

			const childBoundingBox = this.getChildBoundingBox(ctx, this, this, i);

			if (!boundingBox) {
				boundingBox = childBoundingBox;
			} else {
				boundingBox.addBoundingBox(childBoundingBox);
			}
		});

		return boundingBox;
	}

	protected getTElementBoundingBox(ctx: CanvasRenderingContext2D) {

		const {
			document,
			parent
		} = this;
		const fontSize = parent.getStyle('font-size').getNumber(Font.parse(document.ctx.font).fontSize);

		return new BoundingBox(
			this.x,
			this.y - fontSize,
			this.x + this.measureText(ctx),
			this.y
		);
	}

	getGlyph(
		font: FontElement,
		text: string,
		i: number
	) {

		const char = text[i];
		let glyph: GlyphElement = null;

		if (font.isArabic) {

			const len = text.length;
			const prevChar = text[i - 1];
			const nextChar = text[i + 1];
			let arabicForm = 'isolated';

			if ((i === 0 || prevChar === ' ') && i < len - 2 && nextChar !== ' ') {
				arabicForm = 'terminal';
			}

			if (i > 0 && prevChar !== ' ' && i < len - 2 && nextChar !== ' ') {
				arabicForm = 'medial';
			}

			if (i > 0 && prevChar !== ' ' && (i === len - 1 || nextChar === ' ')) {
				arabicForm = 'initial';
			}

			if (typeof font.glyphs[char] !== 'undefined') {

				glyph = font.glyphs[char][arabicForm];

				if (!glyph && font.glyphs[char].type === 'glyph') {
					glyph = font.glyphs[char] as GlyphElement;
				}
			}

		} else {
			glyph = font.glyphs[char] as GlyphElement;
		}

		if (!glyph) {
			glyph = font.missingGlyph as GlyphElement;
		}

		return glyph;
	}

	getText() {
		return '';
	}

	renderChildren(ctx: CanvasRenderingContext2D) {

		if (this.type !== 'text') {
			this.renderTElementChildren(ctx);
			return;
		}

		this.initializeCoordinates(ctx);
		this.children.forEach((_, i) => {
			this.renderChild(ctx, this, this, i);
		});
		this.document.screen.mouse.checkBoundingBox(this, this.getBoundingBox(ctx));
	}

	protected renderTElementChildren(ctx: CanvasRenderingContext2D) {

		const {
			document,
			parent
		} = this;
		const customFont = parent.getStyle('font-family').getDefinition<FontElement>();

		if (customFont) {

			const ctxFont = Font.parse(document.ctx.font);
			const fontSize = parent.getStyle('font-size').getNumber(ctxFont.fontSize);
			const fontStyle = parent.getStyle('font-style').getString(ctxFont.fontStyle);
			const text = customFont.isRTL
				? this.getText().split('').reverse().join('')
				: this.getText();
			const dx = toNumberArray(parent.getAttribute('dx').getString());
			const len = text.length;

			for (let i = 0; i < len; i++) {

				const glyph = this.getGlyph(customFont, text, i);
				const scale = fontSize / customFont.fontFace.unitsPerEm;

				ctx.translate(this.x, this.y);
				ctx.scale(scale, -scale);

				const lw = ctx.lineWidth;

				ctx.lineWidth = ctx.lineWidth * customFont.fontFace.unitsPerEm / fontSize;

				if (fontStyle === 'italic') {
					ctx.transform(1, 0, .4, 1, 0, 0);
				}

				glyph.render(ctx);

				if (fontStyle === 'italic') {
					ctx.transform(1, 0, -.4, 1, 0, 0);
				}

				ctx.lineWidth = lw;
				ctx.scale(1 / scale, -1 / scale);
				ctx.translate(-this.x, -this.y);

				this.x += fontSize * (glyph.horizAdvX || customFont.horizAdvX) / customFont.fontFace.unitsPerEm;

				if (typeof dx[i] !== 'undefined' && !isNaN(dx[i])) {
					this.x += dx[i];
				}
			}

			return;
		}

		const renderText = compressSpaces(this.getText());
		const {
			x,
			y
		} = this;

		if ((ctx as any).paintOrder === 'stroke') {

			if (ctx.strokeStyle) {
				ctx.strokeText(renderText, x, y);
			}

			if (ctx.fillStyle) {
				ctx.fillText(renderText, x, y);
			}

		} else {

			if (ctx.fillStyle) {
				ctx.fillText(renderText, x, y);
			}

			if (ctx.strokeStyle) {
				ctx.strokeText(renderText, x, y);
			}
		}

	}

	protected getAnchorDelta(
		ctx: CanvasRenderingContext2D,
		parent: Element,
		startI: number
	) {

		const textAnchor = this.getStyle('text-anchor').getString('start');

		if (textAnchor !== 'start') {

			const len = parent.children.length;
			let width = 0;

			for (let i = startI; i < len; i++) {

				const child = parent.children[i] as TextElement;

				if (i > startI && child.getAttribute('x').hasValue()) {
					break; // new group
				}

				width += child.measureTextRecursive(ctx);
			}

			return -1 * (textAnchor === 'end' ? width : width / 2.0);
		}
		return 0;
	}

	protected adjustChildCoordinates(
		ctx: CanvasRenderingContext2D,
		textParent: TextElement,
		parent: Element,
		i: number
	) {

		const child = parent.children[i] as TextElement;

		if (typeof child.measureText !== 'function') {
			return child;
		}

		const xAttr = child.getAttribute('x');

		if (xAttr.hasValue()) {

			child.x = xAttr.getPixels('x') + textParent.getAnchorDelta(ctx, parent, i);

			// local text-anchor
			const textAnchor = child.getAttribute('text-anchor').getString('start');

			if (textAnchor !== 'start') {

				const width = child.measureTextRecursive(ctx);

				child.x += -1 * (textAnchor === 'end' ? width : width / 2.0);
			}

			const dxAttr = child.getAttribute('dx');

			if (dxAttr.hasValue()) {
				child.x += dxAttr.getPixels('x');
			}

		} else {

			const dxAttr = child.getAttribute('dx');

			if (dxAttr.hasValue()) {
				textParent.x += dxAttr.getPixels('x');
			}

			child.x = textParent.x;
		}

		textParent.x = child.x + child.measureText(ctx);

		const yAttr = child.getAttribute('y');

		if (yAttr.hasValue()) {

			child.y = yAttr.getPixels('y');

			const dyAttr = child.getAttribute('dy');

			if (dyAttr.hasValue()) {
				child.y += dyAttr.getPixels('y');
			}

		} else {

			const dyAttr = child.getAttribute('dy');

			if (dyAttr.hasValue()) {
				textParent.y += dyAttr.getPixels('y');
			}

			child.y = textParent.y;
		}

		textParent.y = child.y;

		return child;
	}

	protected getChildBoundingBox(
		ctx: CanvasRenderingContext2D,
		textParent: TextElement,
		parent: Element,
		i: number
	) {

		const child = this.adjustChildCoordinates(ctx, textParent, parent, i);
		const boundingBox = child.getBoundingBox(ctx);

		child.children.forEach((_, i) => {

			const childBoundingBox = textParent.getChildBoundingBox(ctx, textParent, child, i);

			boundingBox.addBoundingBox(childBoundingBox);
		});

		return boundingBox;
	}

	protected renderChild(
		ctx: CanvasRenderingContext2D,
		textParent: TextElement,
		parent: Element,
		i: number
	) {

		const child = this.adjustChildCoordinates(ctx, textParent, parent, i);

		child.render(ctx);
		child.children.forEach((_, i) => {
			textParent.renderChild(ctx, textParent, child, i);
		});
	}

	protected measureTextRecursive(ctx: CanvasRenderingContext2D) {

		const width: number = this.children.reduce(
			(width, child: TextElement) => width + child.measureTextRecursive(ctx),
			this.measureText(ctx)
		);

		return width;
	}

	protected measureText(ctx: CanvasRenderingContext2D) {

		const {
			parent,
			document
		} = this;
		const customFont = parent.getStyle('font-family').getDefinition<FontElement>();

		if (customFont) {

			const fontSize = parent.getStyle('font-size').getNumber(Font.parse(document.ctx.font).fontSize);
			const text = customFont.isRTL
				? this.getText().split('').reverse().join('')
				: this.getText();
			const dx = toNumberArray(parent.getAttribute('dx').getString());
			const len = text.length;
			let measure = 0;

			for (let i = 0; i < len; i++) {

				const glyph = this.getGlyph(customFont, text, i);

				measure += (glyph.horizAdvX || customFont.horizAdvX) * fontSize / customFont.fontFace.unitsPerEm;

				if (typeof dx[i] !== 'undefined' && !isNaN(dx[i])) {
					measure += dx[i];
				}
			}
			return measure;
		}

		const textToMeasure = compressSpaces(this.getText());

		if (!ctx.measureText) {
			return textToMeasure.length * 10;
		}

		ctx.save();
		this.setContext(ctx, true);

		const width = ctx.measureText(textToMeasure).width;
		ctx.restore();

		return width;
	}
}
