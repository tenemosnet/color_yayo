/**
 * product-master.js - 互換性用リダイレクト
 * 共通マスタモジュールへの移行に伴い、このファイルは廃止予定
 * 新規コードでは ../../common/product-master.js を直接参照してください
 */

export {
    parseProductMasterCSV,
    loadProductMasterFile,
    saveProductMaster,
    loadProductMaster,
    getProductMasterInfo,
    getWholesalePrice,
    getProductName,
    getProductCategory1,
    searchProductsByText,
    clearProductMaster
} from '../../common/product-master.js';
