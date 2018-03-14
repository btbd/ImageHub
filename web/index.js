(function(document) {
	var DEFAULT_HEADERS = [].slice.call(document.getElementsByTagName("th"));
	for (var i = 0; i < DEFAULT_HEADERS.length; ++i) DEFAULT_HEADERS[i] = DEFAULT_HEADERS[i].innerText;
	
	$(document).ready(ready);
	$(window).on("resize", ready);
	
	var search_id       = 0;
	var search_total    = 0;
	var search_done     = 0;
	var tag_count       = 0;
	
	var tags_query      = [];
	var manifest_query  = [];
	
	var e_search        = document.getElementById("search");
	var e_query         = document.getElementById("query");
	var e_namespace     = document.getElementById("namespace");
	var e_results       = document.getElementById("results");
	var e_results_count = document.getElementById("results_count");
	var e_progress      = document.getElementById("progress");
	var e_official      = document.getElementById("official");
	var e_automated     = document.getElementById("automated");
	var e_headers       = document.getElementById("headers");
	var e_description = document.getElementById("description");
	
	function search() {
		e_namespace.value = e_namespace.value.trim();
		e_query.value = e_query.value.trim();
		
		$("body").addClass("wait");
		
		resetSearch();
		
		var query     = encodeURIComponent(e_query.value);
		var namespace = encodeURIComponent(e_namespace.value);
		
		window.history.replaceState(null, null, window.location.pathname);
		if (query || namespace) {
			var q = "?" + (query ? "q=" + query + "&" : "") + (namespace ? "n=" + namespace + "&" : "") + (e_official.checked ? "o=1&" : "") + (e_automated.checked ? "a=1&" : "");
			if (q.charAt(q.length - 1) === '&') q = q.slice(0, -1);
			window.history.replaceState(null, null, q);
		}
		
		search_id = Date.now();
		
		if (isBlank(query) && isBlank(namespace)) {
			finishSearch();
			return;
		}
		
		var url = "./search?";
		if (!isBlank(query)) url = addQueryParam(url, "q", query);
		if (!isBlank(namespace)) url = addQueryParam(url, "n", namespace);
		if (e_official.checked) url = addQueryParam(url, "o", "1");
		if (e_automated.checked) url = addQueryParam(url, "a", "1");
		if (!isBlank(namespace)) url = addQueryParam(url, "s", "1000");
		
		url = addQueryParam(url, "p", "0");
		url = url.slice(0, -1);
		
		getResults(search_id, url, 0);
	}
	
	function addResults(id, results) {
		if (id === search_id) {
			for (var i = 0; i < results.length && id === search_id && search_done < search_total; ++i, ++search_done) {
				var img = results[i].namespace + "/" + results[i].name;
				if (!document.getElementById(img)) {
					var row = e_results.insertRow(-1);
					$(row).attr("id", results[i].namespace + "/" + results[i].name);
					row.insertCell(0).innerHTML = "<a title=\"" + results[i].namespace + "\" href=\"./?n=" + results[i].namespace + "\">" + results[i].namespace + "</a>";
					row.insertCell(1).innerHTML = "<a title=\"" + results[i].name + "\" href=\"https://hub.docker.com/" + (results[i].is_official ? "_/" : "r/" + (results[i].namespace ? results[i].namespace + "/" : "")) + results[i].name + "\">" + results[i].name + "</a>";

					var c = 2;
					$("th").each(function() {
						if (DEFAULT_HEADERS.indexOf(this.innerText) === -1) {
							row.insertCell(c++).innerText = "-";
						}
					});
					
					row.insertCell(c++).innerHTML = results[i].is_official ? "official" : !results[i].is_private ? "public" : "private";
					row.insertCell(c++).innerHTML = results[i].is_automated ? "y" : "n";
					row.insertCell(c++).innerHTML = results[i].star_count.toString();
					row.insertCell(c++).innerHTML = results[i].pull_count.toString();
					row.insertCell(c).innerHTML = results[i].description;
					$(row.cells[c]).css({ "text-overflow": "ellipsis" });
					addCellHover(row.cells[c], true);
					
					for (var e = c - 2; e < c; ++e) row.cells[e].setAttribute("title", row.cells[e].innerText);
					
					if (results[i].tags_url) {
						tags_query.push(img);
					} else {
						addTagInfo(id, img, results[i].tags);
					}
				}
			}
		}
	}
	
	function getResults(id, url, page) {
		$.getJSON(url + page++, function(e) {
			if (id === search_id) {
				search_total = e.count ? e.count : 0;
				e_results_count.innerHTML = "Results: " + search_total;
				
				if (search_done < search_total && e.results && e.results.length > 0) {
					addResults(id, e.results);
					
					if (search_done < search_total && id === search_id) {
						$(e_progress).attr("style", "");
						e_progress.innerHTML = "Progress: " + Math.round((search_done / search_total) * 100) + "%";
						
						getResults(id, url, page);
						return;
					}
				}
			}
			
			finishSearch();
		}).fail(finishSearch);
	}
	
	function beginQuery(id, query, base_url, callback, finish) {
		if (query.length > 0) {
			var url = base_url;
			for (var i = 0; i < query.length && i < 100 && id === search_id; ++i) {
				url += encodeURIComponent(query[i]) + ",";
			}
			
			if (url.charAt(url.length - 1) === ",") url = url.slice(0, -1);

			if (id === search_id) {
				$.getJSON(url, function(e) {
					if (id === search_id) {
						query.splice(0, 100);
						
						for (var i in e) {
							callback(id, i, e[i]);
						}
						
						beginQuery(id, query, base_url, callback, finish);
					}
				});
			}
		} else if (finish) {
			finish(id);
		}
	}
	
	function addTagInfo(id, name, tags) {
		var row = document.getElementById(name);
		
		if (tags) {
			var manifests = [];
			
			var cols = [];
			var info = [];
			var override = [];
			
			var e_tags = document.createElement("div");
			e_tags.setAttribute("style", "display: none;");
			
			tag_count += tags.length;
			
			for (var i = 0; i < tags.length; ++i) {
				var e_tag = document.createElement("div");
				e_tag.innerText = tags[i].name;
				e_tag.setAttribute("style", "padding-left: 10px;");
				e_tag.setAttribute("title", e_tag.innerText);
				e_tags.appendChild(e_tag);
				
				var imgs = tags[i].images;
				var ti = [];
				for (var e = 0; e < imgs.length; ++e) {
					if (imgs[e].os) {
						var os = imgs[e].os;
						os = os.charAt(0).toUpperCase() + os.slice(1);
						
						if (!headerExists(os)) {
							addHeader(2, os);
						}
						
						if (cols.indexOf(os) === -1) {
							cols.push(os);
						}
						
						ti.push(os);
						
						if (imgs[e].os_version) {
							var v = os + "\nVersion";
							if (!headerExists(v)) {
								addHeader(headerIndex(os) + 1, v);
							}
							
							override.push(v);
							ti.push({ col: v, desc: imgs[e].os_version });
							
							var index = headerIndex(v);
							if (row.cells[index].innerText === "n") {
								row.cells[index].innerText = imgs[e].os_version;
							}
						}
					}
					
					if (imgs[e].architecture) {
						var arch = imgs[e].architecture;

						if (!headerExists(arch)) {
							addHeader(headerIndex("Type"), arch);
						}
						
						if (cols.indexOf(arch) === -1 ) {
							cols.push(arch);
						}
						
						ti.push(arch);
					}
				}
				
				info.push(ti);
				
				var t = name + "/" + tags[i].name;
				if (tags[i].manifest_url) {
					manifest_query.push(t);
				} else {
					manifests.push(t, tags[i].manifest);
				}
			}
			
			for (var i = 0; i < cols.length; ++i) {
				var index = headerIndex(cols[i]);
				row.cells[index].innerText = "y";
			}
			
			var tds = row.cells;
			for (var i = 2, l = headerIndex("Type"); i < l; ++i) {
				if (!tds[i].innerText || tds[i].innerText === "-") {
					if (e_headers.tBodies[0].children[0].children[i].innerHTML.indexOf("Version") === -1) {
						tds[i].innerText = "n";
					} else {
						var found = false;
						
						outer: for (var e = 0; e < info.length; ++e) {
							for (var z = 0; z < info[e].length; ++z) {
								if (info[e][z].col && info[e][z].col.indexOf("Version") !== -1) {
									tds[i].innerText = info[e][z].desc;
									tds[i].setAttribute("title", tds[i].innerText);
									found = true;
									break outer;
								}
							}
						}
						
						if (!found) tds[i].innerText = "\n";
					}
				}
			}
			
			if (tags.length > 1) {
				var twisty = document.createElement("div");
				twisty.setAttribute("class", "twisty");
				twisty.setAttribute("title", "Show tags");
				twisty.innerHTML = "+";
				
				twisty.onclick = function() {
					var row = $(this).parent().parent().get()[0];
					
					if (this.innerText == "+") {
						for (var i = 1, l = headerIndex("Type"); i < l; ++i) {
							row.cells[i].children[+(i === 1)].setAttribute("style", "");
						}
						
						this.innerText = "–";
						this.setAttribute("title", "Hide tags");
					} else {
						for (var i = 1, l = headerIndex("Type"); i < l; ++i) {
							row.cells[i].children[+(i === 1)].setAttribute("style", "display: none;");
						}
						
						this.innerText = "+";
						this.setAttribute("title", "Show tags");
					}
					
				};
				
				row.cells[0].insertBefore(twisty, row.cells[0].firstChild);
				row.cells[1].appendChild(e_tags);
				
				for (var e = 2, l = headerIndex("Type"); e < l; ++e) {
					if (row.cells[e].children.length === 0) {
						var p = document.createElement("div");
						p.setAttribute("style", "display: none;");
						row.cells[e].appendChild(p);
					}
						
					var div = row.cells[e].children[0];
					for (var i = 0; i < info.length; ++i) {
						var c = document.createElement("div");
						
						var index = -1;
						var text = e_headers.tBodies[0].children[0].children[e].innerHTML.replace("<br>", "\n");
						for (var z = 0; z < info[i].length; ++z) {
							if (info[i][z] === text || info[i][z].col === text) {
								index = z;
								break;
							}
						}
						
						if (index !== -1) {
							if (info[i][index].desc) {
								c.innerText = info[i][index].desc;
								c.setAttribute("title", c.innerText);
							} else {
								c.innerText = "y";
							}
						} else if (override.indexOf(text) === -1) {
							c.innerText = "n";
						} else {
							c.innerText = "\n";
						}
						
						div.appendChild(c);
					}
				}
			} else if (info.length > 0) {
				row.cells[1].innerHTML += ":" + tags[0].name;
				row.cells[1].children[0].setAttribute("title", row.cells[1].innerText);
			}
			
			for (var i = 0; i < manifests.length; i += 2){ 
				addManifestInfo(id, manifests[i], manifests[i + 1]);
			}
		} else {
			for (var r = row.cells, i = 2, l = headerIndex("Type"); i < l; ++i) {
				if (r[i].innerText === "") r[i].innerText = "n";
			}
		}
	}
	
	function addManifestInfo(id, name, manifests) {
		--tag_count;
		var row = document.getElementById(name.slice(0, name.lastIndexOf("/")));

		if (manifests) {
			for (var i = 0; i < manifests.length; ++i){ 
				if (manifests[i].architecture && manifests[i].variant) {
					var header = manifests[i].architecture + "\n" + manifests[i].variant;
					if (!headerExists(header)) {
						addHeader(headerIndex(manifests[i].architecture) + 1, header);
					}
					
					var cell = row.cells[headerIndex(header)];
					cell.innerHTML = "y" + cell.innerHTML.slice(1);
					cell = cell.children[0];
					
					if (cell) {
						var index = -1;
						for (var c = row.cells[1].children[1].children, e = 0; e < c.length; ++e) {
							if (c[e].innerText === name.slice(name.lastIndexOf("/") + 1)) {
								index = e;
								break;
							}
						}

						cell.children[index].innerText = "y";
					}
				}
			}
		}
	}
	
	function finishSearch() {
		$(e_results).attr("style", "");
		$(e_results).css("width", "100%");
		
		search_total = e_results.rows.length;
		search_done = 0;
		e_progress.innerHTML = "Tag Progress: 0%";
		e_results_count.innerHTML = "Results: " + search_total;
		
		beginQuery(search_id, tags_query, "./tags?i=", function(a0, a1, a2) { 
			$(e_progress).attr("style", "");
			e_progress.innerHTML = "Tag Progress: " + Math.round((++search_done / search_total) * 100) + "%";
			addTagInfo(a0, a1, a2);
		}, function(id) { 
			search_total = tag_count;
			search_done = 0;
			e_progress.innerHTML = "Manifest Progress: 0%";
		
			beginQuery(id, manifest_query, "./manifest?i=", function(a0, a1, a2) {
				$(e_progress).attr("style", "");
				e_progress.innerHTML = "Manifest Progress: " + Math.round((++search_done / search_total) * 100) + "%";
				addManifestInfo(a0, a1, a2);
			}, function() { 
				e_progress.innerHTML = "Finished";
				$(e_progress).fadeOut("slow");
				$("body").removeClass("wait");
			});
		});
	}
	
	function resetSearch() {
		tags_query.length = 0;
		manifest_query.length = 0;
		
		e_results.innerHTML = "";
		$(e_results).css({ display: "none", width: "100%" })
		e_results_count.innerHTML = "Results: 0";
		e_progress.innerHTML = "Progress: 0%";
		$(e_progress).attr("style", "");
		
		$("th").each(function() {
			if (DEFAULT_HEADERS.indexOf(this.innerText) === -1) {
				$(this).remove();
			}
			
			$(".arrow-up", this).remove();
			$(".arrow-down", this).remove();
		});
		
		search_total = search_done = 0;
	}
	
	function inputSearch(e) {
		if (e.keyCode === 13) {
			search();
		}
	}
	
	$(e_search).click(search);
	$(e_query).keypress(inputSearch);
	$(e_namespace).keypress(inputSearch);
	
	function ready() {
		$("#github").css("display", "");
		$("#table_holder").css({ "margin-top": $("#options").outerHeight() + 10, display: "" });
		$("#results_holder").css({ "overflow-y": "scroll", height: $(window).height() - ($("#headers").offset().top + $("#headers").outerHeight() + 40) });
		$("#table_holder_margin").css({ "padding-right": getScrollBarWidth() });
	}
	
	function getScrollBarWidth() {
		var o = $("<div>").css({ visibility: "hidden", width: 100, overflow: "scroll" }).appendTo("body");
        var s = $("<div>").css({ width: "100%" }).appendTo(o).outerWidth();
		o.remove();
		return 100 - s;
	}
	
	function isBlank(s) {
		return s.length === 0 || !s.trim();
	}
	
	function addQueryParam(url, name, value) {
		if (url[url.length - 1] !== '?') {
			url += "&";
			
		}
		
		return url + name + "=" + value;
	}
	
	function headerExists(title) {
		var r = false;
		
		$("th").each(function() {
			if (this.innerText === title) {
				r = true;
				return false;
			}
		});
		
		return r;
	}
	
	function headerIndex(title) {
		var index = -1;
		
		$("th").each(function(i) {
			if (this.innerText === title) {
				index = i;
				return false;
			}
		});
		
		return index;
	}
	
	function getNthStyle(tag, index, width, style) {
		return "tr " + tag + ":nth-child(" + index + "){width:" + width + ";" + (style ? style + ";" : "") + "}";
	}
	
	function addHeader(index, title) {
		var initial = title.indexOf("Version") === -1 ? "n" : "";
		var e = e_headers.tBodies[0].children[0];
		var headers = [].slice.call(e.children);
		
		var th = document.createElement("th");
		th.innerText = title;
		
		headers.splice(index, 0, th);

		e.children.length = 0;
		for (var i = 0; i < headers.length; ++i) {
			e.appendChild(headers[i]);
		}
		
		for (var i = 0; i < e_results.rows.length; ++i) {
			var row = e_results.rows[i];
			if (row.children.length === headers.length - 1) {
				row.insertCell(index).innerText = initial;
			}
			
			if (row.cells[1].children.length > 1) {
				var tags = row.cells[1].children[1].children.length;
				if (tags > 0) {
					var p = document.createElement("div");
					p.setAttribute("style", "display: none;");
					for (var e = 0; e < tags; ++e) {
						var c = document.createElement("div");
						c.innerText = initial;
						p.appendChild(c);
					}
					row.cells[index].appendChild(p);
				}
			}
		}
		
		var h = $("head").children().last();
		if (h.prop("tagName").toLowerCase() == "style") {
			h.remove();
		}

		var style = "<style>";
		var width = headers.length - 3 > 10 ? ((70 / (headers.length - 3)) + "%") : "7%";

		for (var i = 0; i < headers.length - 7; ++i) {
			style += getNthStyle("th", i + 3, width, "text-align:center");
			style += getNthStyle("td", i + 3, width, "text-align:center");
		}
		
		for (var i = headers.length - 4; i < headers.length; ++i) {
			var c = i === headers.length - 3 ? "text-align:center" : undefined;
			style += getNthStyle("th", i, width, c);
			style += getNthStyle("td", i, width, c);
		}
		
		style += "</style>";
		$("head").append(style);
		
		addHeaderSort();
	}

	function addHeaderSort() {
		const arrow_up   = '<div class="arrow-up"></div>';
		const arrow_down = '<div class="arrow-down"></div>';
		
		$("th").each(function() {
			$(this).off();
			
			$(this).mousedown(function() {
				var curr = this;
				$("th").each(function() {
					if (this !== curr) {
						$(".arrow-up", this).remove();
						$(".arrow-down", this).remove();
					}
				});
				
				var m = 1;
				if (this.innerHTML.indexOf(arrow_up) === -1) {
					$(".arrow-down", this).remove();
					$(this).append(arrow_up);
				} else {
					$(".arrow-up", this).remove();
					$(this).append(arrow_down);
					m = -1;
				}
				
				var index = $("th").index($(this));
				var backup = index === 1 ? 0 : 1;

				if (e_results.rows.length > 0) {
					var rows = [];
					for (var i = e_results.rows.length - 1; i > -1; --i) {
						rows.push(e_results.rows[i]);
					}
					
					var offset = e_results.rows[0].cells.length - index;
					if (offset === 3 || offset === 2) {
						rows.sort(function(a, b) {
							var r = parseInt(b.cells[index].innerText) - parseInt(a.cells[index].innerText);
							if (r !== 0) return m * r;
						
							return a.cells[backup].innerText.replace("+", "").localeCompare(b.cells[backup].innerText.replace("+", ""));
						});
					} else {
						rows.sort(function(a, b) {
							var r = a.cells[index].innerText.replace("+", "").localeCompare(b.cells[index].innerText.replace("+", ""));
							if (r !== 0) return m * r;
							
							return a.cells[backup].innerText.replace("+", "").localeCompare(b.cells[backup].innerText.replace("+", ""));
						});
					}
					
					e_results.tBodies.length = 0;
					e_results.appendChild(document.createElement("tbody"));
					
					for (var i = 0; i < rows.length; ++i) {
						e_results.tBodies[0].appendChild(rows[i]);
					}
				}
			});
		});
	}
	
	addHeaderSort();
	
	function addCellHover(cell, click) {
		$(cell).mouseover(function(e) {
			if (this.offsetWidth < this.scrollWidth) {
				var p = this.getBoundingClientRect().top;
				e_description.innerText = this.innerText;
				$(e_description).attr("style", "");
				$(e_description).css({
					"box-shadow": "0px 0px 10px #000000",
					padding: "5px 5px 5px 5px",
					top: p - e_description.offsetHeight - 10,
					right: $(window).width() - this.getBoundingClientRect().right
				});
			}
		});
			
		if (click) {
			$(cell).mousedown(function() {
				if (this.offsetWidth < this.scrollWidth) {
					var cell = this;
					$(cell).unbind("mouseleave");
					
					e_description.onmouseleave = function() {
						$(cell).mouseleave(function(e) {
							$(e_description).attr("style", "");
							$(e_description).css("display", "none");
						});
		
						$(e_description).attr("style", "");
						$(e_description).css("display", "none");
						$(e_description).unbind("mouseleave");
					};
					
					$(e_description).css({
						"box-shadow": "0px 0px 10px #000000",
						padding: "5px 5px 5px 5px",
						top: this.getBoundingClientRect().top - 10,
						right: $(window).width() - this.getBoundingClientRect().right
					});
				}
			});
		}
			
		$(cell).mouseleave(function(e) {
			$(e_description).attr("style", "");
			$(e_description).css("display", "none");
		});
	}
	
	$(e_official).click(function() {
		if (e_official.checked) {
			e_namespace.value = "library";
			e_namespace.disabled = true;
		} else {
			e_namespace.value = "";
			e_namespace.disabled = false;
		}
	});
	
	if (!isBlank(window.location.search)) {
		var s = decodeURIComponent(window.location.search.slice(1));
		if (!isBlank(s)) {
			var i = s.indexOf("n=");
			if (i !== -1) {
				var e = s.indexOf("&", i);
				e_namespace.value = s.substring(i + 2, e === -1 ? s.length : e);
			}
			
			i = s.indexOf("q=");
			if (i !== -1) {
				var e = s.indexOf("&", i);
				e_query.value = s.substring(i + 2, e === -1 ? s.length : e);
			}
			
			i = s.indexOf("a=");
			if (i !== -1) {
				var e = s.indexOf("&", i);
				if (s.substring(i + 2, e === -1 ? s.length : e) === "1") {
					e_automated.checked = true;
				}
			}
			
			i = s.indexOf("o=");
			if (i !== -1) {
				var e = s.indexOf("&", i);
				if (s.substring(i + 2, e === -1 ? s.length : e) === "1") {
					e_official.checked = true;
					e_namespace.disabled = true;
				}
			}
			
			search();
		}
	}
})(document);