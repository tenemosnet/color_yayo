/**
 * customer-master.js - 互換性用リダイレクト
 * 共通マスタモジュールへの移行に伴い、このファイルは廃止予定
 * 新規コードでは ../../common/customer-master.js を直接参照してください
 */

export {
    parseCustomerMasterCSV,
    loadCustomerMasterFile,
    saveCustomerMaster,
    loadCustomerMaster,
    getCustomerMasterInfo,
    clearCustomerMaster,
    findCustomerByName,
    findCustomerByDomain,
    findCustomerByEmail,
    getCustomerByCode,
    setDomainMapping
} from '../../common/customer-master.js';
