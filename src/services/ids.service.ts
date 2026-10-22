// Resource ids are MongoDB ObjectIds: 24 hexadecimal characters. Any other FHIR id is
// valid syntax but cannot belong to this server. (mongoose.isValidObjectId is not
// enough: it also accepts any 12-character string.)
export const isMongoId = (id: string): boolean => /^[a-f\d]{24}$/i.test(id);
